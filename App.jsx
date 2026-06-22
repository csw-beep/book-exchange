import { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from "firebase/firestore";


// ── Firebase 초기화 ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCKlrRaO7XCKpWhlE5lloogrjvyK5ssjmo",
  authDomain: "book-exchange-12639.firebaseapp.com",
  projectId: "book-exchange-12639",
  storageBucket: "book-exchange-12639.firebasestorage.app",
  messagingSenderId: "232667258960",
  appId: "1:232667258960:web:929f7b1206c594ff4c7155",
};
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);

// ── 이미지 압축 (Firestore 1MB 제한 대응) ────────────────────────────────────
async function compressImage(file, maxSizeKB = 700) {
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      // 최대 1200px로 축소
      if (w > 1200) { h = Math.round(h * 1200 / w); w = 1200; }
      if (h > 1600) { w = Math.round(w * 1600 / h); h = 1600; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      // quality를 줄여가며 목표 크기 이하로
      let quality = 0.85;
      const tryCompress = () => {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const sizeKB  = Math.round((dataUrl.length * 3) / 4 / 1024);
        if (sizeKB <= maxSizeKB || quality <= 0.3) {
          URL.revokeObjectURL(url);
          res(dataUrl); // data:image/jpeg;base64,... 형태
        } else {
          quality -= 0.1;
          tryCompress();
        }
      };
      tryCompress();
    };
    img.src = url;
  });
}


async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("파일 읽기 실패"));
    r.readAsDataURL(file);
  });
}
async function ocrImage(base64, mediaType) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 1500,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "이 책 페이지의 본문 텍스트를 정확하게 추출해줘.\n- 페이지 번호·머리글·꼬리글 제외\n- 원문 그대로, 요약 금지\n- 추출 텍스트만 출력 (설명 없이)\n- 읽을 수 없으면 [읽을 수 없음] 만 출력" },
      ]}],
    }),
  });
  if (!res.ok) throw new Error(`OCR 실패 (${res.status})`);
  const data = await res.json();
  return data.content.find(b => b.type === "text")?.text?.trim() || "";
}

// ── 상수 ─────────────────────────────────────────────────────────────────────
const EMOJIS = ["❤️","🔥","💡","🤔","😮","👏"];
const COLORS  = [
  { id:"amber",   color:"#F59E0B", light:"#FEF3C7" },
  { id:"rose",    color:"#F43F5E", light:"#FFE4E6" },
  { id:"sky",     color:"#0EA5E9", light:"#E0F2FE" },
  { id:"violet",  color:"#8B5CF6", light:"#EDE9FE" },
  { id:"emerald", color:"#10B981", light:"#D1FAE5" },
];
const getColor = (id) => COLORS.find(c => c.id === id) || COLORS[0];

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────────────
function Avatar({ user, size = 32 }) {
  if (!user) return null;
  return user.photoURL
    ? <img src={user.photoURL} alt={user.displayName} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: "50%", background: "#1C4532", color: "#F5E6C8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>
        {(user.displayName || "?")[0]}
      </div>;
}

function ReactionBar({ reactions = {}, onReact, currentUid }) {
  const [open, setOpen] = useState(false);
  const hasAny = EMOJIS.some(e => (reactions[e] || []).length > 0);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {EMOJIS.map(e => {
        const who = reactions[e] || [];
        if (!who.length) return null;
        const mine = who.includes(currentUid);
        return (
          <button key={e} onClick={() => onReact(e)}
            style={{ padding: "2px 8px", borderRadius: 20, border: mine ? "1.5px solid #1C4532" : "1.5px solid #E8E0D0", background: mine ? "#D1FAE5" : "#FFFEF9", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 3, fontFamily: "'DM Sans',sans-serif" }}>
            {e} <span style={{ color: "#6B7280" }}>{who.length}</span>
          </button>
        );
      })}
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(p => !p)}
          style={{ padding: "2px 8px", borderRadius: 20, border: "1.5px dashed #C8BFA8", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "#9CA3AF" }}>+</button>
        {open && (
          <div style={{ position: "absolute", bottom: "120%", left: 0, background: "#FFFEF9", border: "1px solid #E8E0D0", borderRadius: 12, padding: "6px 8px", display: "flex", gap: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50 }}>
            {EMOJIS.map(e => <button key={e} onClick={() => { onReact(e); setOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", padding: "2px 3px" }}>{e}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 로그인 화면 ───────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onLogin();
    } catch (e) {
      setError("로그인에 실패했어요. 다시 시도해주세요.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EE", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ background: "#FFFEF9", border: "1px solid #E8E0D0", borderRadius: 20, padding: "3rem 2.5rem", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📖</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", fontWeight: 600, color: "#1C4532", marginBottom: "0.5rem" }}>교환독서</div>
        <p style={{ color: "#6B7280", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "2rem" }}>
          마음에 든 페이지를 사진으로 찍어 올리고<br/>함께 코멘트를 나눠보세요
        </p>
        {error && <div style={{ background: "#FFF1F2", color: "#DC2626", fontSize: "0.8rem", padding: "8px 12px", borderRadius: 8, marginBottom: "1rem" }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width: "100%", padding: "0.85rem", borderRadius: 12, border: "1px solid #E8E0D0", background: "#fff", cursor: loading ? "default" : "pointer", fontSize: "0.9rem", fontFamily: "'DM Sans',sans-serif", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#374151", transition: "box-shadow 0.15s", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.2 33.6 29.7 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.1-6.1C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.9 0 20-7.9 20-21 0-1.3-.1-2.7-.5-4z"/></svg>
          {loading ? "로그인 중…" : "Google로 시작하기"}
        </button>
        <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: "1.25rem" }}>로그인하면 모임 멤버들과 함께 읽을 수 있어요</p>
      </div>
    </div>
  );
}

// ── 페이지 업로드 모달 ────────────────────────────────────────────────────────
function UploadModal({ currentUser, bookTitle, onClose }) {
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [caption, setCaption]     = useState("");
  const [colorId, setColorId]     = useState("amber");
  const [ocrText, setOcrText]     = useState("");
  const [ocrState, setOcrState]   = useState("idle"); // idle|running|done|error
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState(null);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setOcrText(""); setOcrState("idle");
  };

  const runOcr = async () => {
    if (!file) return;
    setOcrState("running"); setError(null);
    try {
      const base64 = await fileToBase64(file);
      const text   = await ocrImage(base64, file.type || "image/jpeg");
      setOcrText(text); setOcrState("done");
    } catch {
      setOcrState("error");
      setError("텍스트를 읽지 못했어요. 사진이 선명한지 확인해보세요.");
    }
  };

  const handleSubmit = async () => {
    if (!file || !caption.trim()) return;
    setUploading(true); setError(null);
    try {
      // 이미지 압축 후 base64로 Firestore에 직접 저장
      const imageDataUrl = await compressImage(file);

      await addDoc(collection(db, "posts"), {
        authorUid:   currentUser.uid,
        authorName:  currentUser.displayName,
        authorPhoto: currentUser.photoURL || null,
        bookTitle,
        imageDataUrl,               // base64 이미지 (Storage 불필요)
        caption:     caption.trim(),
        ocrText:     ocrText.trim(),
        colorId,
        reactions:   {},
        comments:    [],
        createdAt:   serverTimestamp(),
      });
      onClose();
    } catch (e) {
      setError("업로드에 실패했어요. 사진 용량을 줄여서 다시 시도해보세요.");
    } finally { setUploading(false); }
  };

  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #D1C9B8", fontFamily: "'DM Sans',sans-serif", fontSize: "0.88rem", outline: "none", background: "#FAFAF7", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#FFFEF9", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ padding: "1.1rem 1.4rem", borderBottom: "1px solid #E8E0D0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1rem", fontWeight: 600, color: "#1C4532" }}>📸 페이지 올리기</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "#9CA3AF" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "1.1rem 1.4rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* 이미지 업로드 */}
          {!preview ? (
            <div onClick={() => inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
              style={{ border: "2px dashed #C8BFA8", borderRadius: 12, padding: "3rem 2rem", textAlign: "center", cursor: "pointer", background: "#FAFAF7" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>📖</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "#1C4532", marginBottom: 4 }}>마음에 든 페이지를 사진으로 찍어서 올려요</div>
              <div style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>클릭하거나 드래그 · JPG · PNG · HEIC</div>
              <input ref={inputRef} type="file" accept="image/*" onChange={e => pickFile(e.target.files[0])} style={{ display: "none" }} />
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <img src={preview} alt="" style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "contain", background: "#F0EBE0" }} />
              <button onClick={() => { setFile(null); setPreview(null); setOcrText(""); setOcrState("idle"); }}
                style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: "0.78rem" }}>✕</button>
            </div>
          )}

          {/* OCR */}
          {preview && (
            <div style={{ background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 10, padding: "0.85rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#065F46", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>🔍 AI 텍스트 추출 (선택)</span>
                {ocrState === "idle" && <button onClick={runOcr} style={{ fontSize: "0.75rem", padding: "3px 10px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>추출하기</button>}
                {ocrState === "running" && <span style={{ fontSize: "0.72rem", color: "#6B7280" }}>⏳ 읽는 중…</span>}
                {ocrState === "done"    && <span style={{ fontSize: "0.72rem", color: "#059669" }}>✅ 완료</span>}
                {ocrState === "error"   && <button onClick={runOcr} style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer" }}>다시 시도</button>}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#047857", lineHeight: 1.5 }}>
                {ocrState === "idle"    && "추출하면 코멘트를 달 때 특정 문장을 선택할 수 있어요."}
                {ocrState === "running" && "AI가 페이지를 읽고 있어요…"}
                {ocrState === "error"   && (error || "추출에 실패했어요.")}
                {ocrState === "done"    && (
                  <textarea value={ocrText} onChange={e => setOcrText(e.target.value)}
                    style={{ ...inputStyle, minHeight: 80, marginTop: 6, fontSize: "0.78rem", lineHeight: 1.6, resize: "vertical" }} />
                )}
              </div>
            </div>
          )}

          {/* 한마디 */}
          <div>
            <label style={{ fontSize: "0.72rem", color: "#6B7280", fontWeight: 500, marginBottom: 4, display: "block" }}>이 페이지를 고른 이유 *</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="어떤 부분이 마음에 들었나요? 자유롭게 적어보세요."
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} />
          </div>

          {/* 색상 */}
          <div>
            <label style={{ fontSize: "0.72rem", color: "#6B7280", fontWeight: 500, marginBottom: 6, display: "block" }}>카드 색상</label>
            <div style={{ display: "flex", gap: 8 }}>
              {COLORS.map(c => <button key={c.id} onClick={() => setColorId(c.id)} style={{ width: 26, height: 26, borderRadius: "50%", background: c.color, border: colorId === c.id ? "3px solid #1C4532" : "3px solid transparent", cursor: "pointer", transition: "border 0.15s" }} />)}
            </div>
          </div>

          {error && <div style={{ background: "#FFF1F2", color: "#DC2626", fontSize: "0.8rem", padding: "8px 12px", borderRadius: 8 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: "0.9rem 1.4rem", borderTop: "1px solid #E8E0D0", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1C9B8", background: "transparent", cursor: "pointer", fontSize: "0.82rem", color: "#6B7280", fontFamily: "'DM Sans',sans-serif" }}>취소</button>
          <button onClick={handleSubmit} disabled={!file || !caption.trim() || uploading}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: !file || !caption.trim() || uploading ? "#9CA3AF" : "#1C4532", color: "#F5E6C8", cursor: !file || !caption.trim() || uploading ? "default" : "pointer", fontSize: "0.82rem", fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>
            {uploading ? "올리는 중…" : "올리기 →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 코멘트 입력 ───────────────────────────────────────────────────────────────
function CommentInput({ currentUser, onSubmit }) {
  const [text, setText] = useState("");
  const submit = () => { if (!text.trim()) return; onSubmit(text.trim()); setText(""); };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
      <Avatar user={currentUser} size={28} />
      <div style={{ flex: 1, display: "flex", gap: 6 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="코멘트 달기… (Enter)"
          style={{ flex: 1, padding: "7px 12px", borderRadius: 20, border: "1px solid #E8E0D0", fontFamily: "'DM Sans',sans-serif", fontSize: "0.85rem", outline: "none", background: "#FAFAF7" }} />
        <button onClick={submit} disabled={!text.trim()}
          style={{ padding: "7px 14px", borderRadius: 20, border: "none", background: text.trim() ? "#1C4532" : "#E8E0D0", color: text.trim() ? "#F5E6C8" : "#9CA3AF", cursor: text.trim() ? "pointer" : "default", fontSize: "0.8rem", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
          등록
        </button>
      </div>
    </div>
  );
}

// ── 포스트 카드 ───────────────────────────────────────────────────────────────
function PostCard({ post, currentUser }) {
  const [expanded, setExpanded]       = useState(false);
  const [showComments, setShowComments] = useState(false);
  const col = getColor(post.colorId);

  const handleReact = async (emoji) => {
    const postRef = doc(db, "posts", post.id);
    const who = post.reactions?.[emoji] || [];
    const field = `reactions.${emoji}`;
    if (who.includes(currentUser.uid)) {
      await updateDoc(postRef, { [field]: arrayRemove(currentUser.uid) });
    } else {
      await updateDoc(postRef, { [field]: arrayUnion(currentUser.uid) });
    }
  };

  const handleAddComment = async (text) => {
    const postRef = doc(db, "posts", post.id);
    await updateDoc(postRef, {
      comments: arrayUnion({
        id:          Date.now().toString(),
        authorUid:   currentUser.uid,
        authorName:  currentUser.displayName,
        authorPhoto: currentUser.photoURL || null,
        text,
        createdAt:   new Date().toISOString(),
        reactions:   {},
        replies:     [],
      }),
    });
  };

  const handleReactComment = async (commentId, emoji) => {
    const updated = (post.comments || []).map(c => {
      if (c.id !== commentId) return c;
      const who = c.reactions?.[emoji] || [];
      return { ...c, reactions: { ...c.reactions, [emoji]: who.includes(currentUser.uid) ? who.filter(u => u !== currentUser.uid) : [...who, currentUser.uid] } };
    });
    await updateDoc(doc(db, "posts", post.id), { comments: updated });
  };

  const handleAddReply = async (commentId, text) => {
    const updated = (post.comments || []).map(c => {
      if (c.id !== commentId) return c;
      return { ...c, replies: [...(c.replies || []), { id: Date.now().toString(), authorUid: currentUser.uid, authorName: currentUser.displayName, authorPhoto: currentUser.photoURL || null, text, createdAt: new Date().toISOString() }] };
    });
    await updateDoc(doc(db, "posts", post.id), { comments: updated });
  };

  const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : new Date();
  const timeAgo = (() => {
    const diff = (Date.now() - createdAt.getTime()) / 1000;
    if (diff < 60)   return "방금";
    if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400)return `${Math.floor(diff/3600)}시간 전`;
    return `${Math.floor(diff/86400)}일 전`;
  })();

  const commentCount = post.comments?.length || 0;
  const replyCount   = (post.comments || []).reduce((s, c) => s + (c.replies?.length || 0), 0);
  const totalReactions = Object.values(post.reactions || {}).reduce((s, v) => s + v.length, 0);

  return (
    <div style={{ background: "#FFFEF9", border: "1px solid #E8E0D0", borderLeft: `4px solid ${col.color}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
      {/* 책 페이지 이미지 */}
      <div style={{ position: "relative", background: "#F0EBE0", cursor: "pointer" }} onClick={() => setExpanded(p => !p)}>
        <img src={post.imageDataUrl || post.imageUrl} alt="책 페이지" style={{ width: "100%", maxHeight: expanded ? 600 : 300, objectFit: "contain", display: "block", transition: "max-height 0.3s" }} />
        {!expanded && post.ocrText && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, rgba(240,235,224,0.95))", display: "flex", alignItems: "flex-end", padding: "0 12px 10px" }}>
            <span style={{ fontSize: "0.7rem", color: "#6B7280" }}>탭해서 펼치기 ↓</span>
          </div>
        )}
      </div>

      {/* OCR 텍스트 (펼쳤을 때) */}
      {expanded && post.ocrText && (
        <div style={{ padding: "1rem 1.25rem", background: "#FAFAF7", borderBottom: "1px solid #E8E0D0" }}>
          <div style={{ fontSize: "0.7rem", color: "#9CA3AF", marginBottom: 6 }}>📄 추출된 텍스트</div>
          <p style={{ fontFamily: "'Playfair Display',serif", fontSize: "0.9rem", lineHeight: 1.8, color: "#374151", margin: 0, whiteSpace: "pre-wrap" }}>{post.ocrText}</p>
        </div>
      )}

      {/* 본문 */}
      <div style={{ padding: "1rem 1.25rem" }}>
        {/* 작성자 + 시간 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Avatar user={{ uid: post.authorUid, displayName: post.authorName, photoURL: post.authorPhoto }} size={30} />
          <div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>{post.authorName}</div>
            <div style={{ fontSize: "0.68rem", color: "#9CA3AF" }}>{timeAgo} · {post.bookTitle}</div>
          </div>
        </div>

        {/* 한마디 */}
        <p style={{ fontSize: "0.9rem", color: "#1A1A1A", lineHeight: 1.7, margin: "0 0 10px" }}>{post.caption}</p>

        {/* 반응 */}
        <ReactionBar reactions={post.reactions} onReact={handleReact} currentUid={currentUser.uid} />

        {/* 요약 바 */}
        <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0EBE0", fontSize: "0.78rem", color: "#6B7280" }}>
          {totalReactions > 0 && <span>반응 {totalReactions}</span>}
          <button onClick={() => setShowComments(p => !p)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", color: "#6B7280", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
            💬 코멘트 {commentCount}{replyCount > 0 && ` · 대댓글 ${replyCount}`}
          </button>
        </div>

        {/* 코멘트 영역 */}
        {showComments && (
          <div style={{ marginTop: 10 }}>
            {(post.comments || []).map(c => (
              <CommentThread key={c.id} comment={c} currentUser={currentUser}
                onReact={e => handleReactComment(c.id, e)}
                onAddReply={text => handleAddReply(c.id, text)} />
            ))}
            <CommentInput currentUser={currentUser} onSubmit={handleAddComment} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 코멘트 스레드 ─────────────────────────────────────────────────────────────
function CommentThread({ comment, currentUser, onReact, onAddReply }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const submitReply = () => { if (!replyText.trim()) return; onAddReply(replyText.trim()); setReplyText(""); setShowReply(false); };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Avatar user={{ uid: comment.authorUid, displayName: comment.authorName, photoURL: comment.authorPhoto }} size={26} />
        <div style={{ flex: 1 }}>
          <div style={{ background: "#F7F4EE", borderRadius: "4px 12px 12px 12px", padding: "8px 12px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginRight: 6 }}>{comment.authorName}</span>
            <span style={{ fontSize: "0.82rem", color: "#374151" }}>{comment.text}</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4, paddingLeft: 4, alignItems: "center" }}>
            <ReactionBar reactions={comment.reactions || {}} onReact={onReact} currentUid={currentUser.uid} />
            <button onClick={() => setShowReply(p => !p)}
              style={{ fontSize: "0.72rem", color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {(comment.replies?.length || 0) > 0 ? `대댓글 ${comment.replies.length}개` : "대댓글 달기"}
            </button>
          </div>

          {/* 대댓글 */}
          {(comment.replies || []).map(r => (
            <div key={r.id} style={{ display: "flex", gap: 6, marginTop: 6, paddingLeft: 8 }}>
              <Avatar user={{ uid: r.authorUid, displayName: r.authorName, photoURL: r.authorPhoto }} size={20} />
              <div style={{ background: "#F0EBE0", borderRadius: "4px 10px 10px 10px", padding: "6px 10px", flex: 1 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#374151", marginRight: 5 }}>{r.authorName}</span>
                <span style={{ fontSize: "0.78rem", color: "#374151" }}>{r.text}</span>
              </div>
            </div>
          ))}

          {showReply && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, paddingLeft: 8 }}>
              <Avatar user={currentUser} size={20} />
              <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === "Enter" && submitReply()}
                placeholder="대댓글… (Enter)" autoFocus
                style={{ flex: 1, padding: "5px 10px", borderRadius: 16, border: "1px solid #D1C9B8", fontFamily: "'DM Sans',sans-serif", fontSize: "0.78rem", outline: "none", background: "#FAFAF7" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 앱 ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]             = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [posts, setPosts]           = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [bookTitle, setBookTitle]   = useState("나는 왜 타인의 시선을 두려워하는가");
  const [editingBook, setEditingBook] = useState(false);
  const [bookDraft, setBookDraft]   = useState("");
  const [toast, setToast]           = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // 로그인 상태 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  // 포스트 실시간 구독
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    showToast("로그아웃 됐어요");
  };

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#F7F4EE", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", color: "#6B7280" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      📖 불러오는 중…
    </div>
  );

  if (!user) return <LoginScreen onLogin={() => {}} />;

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: "#F7F4EE", color: "#1A1A1A" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1C4532", color: "#F5E6C8", padding: "10px 20px", borderRadius: 24, fontSize: "0.85rem", zIndex: 999, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", whiteSpace: "nowrap", animation: "fadeInUp 0.25s ease" }}>
          {toast}
        </div>
      )}

      {/* 업로드 모달 */}
      {showUpload && <UploadModal currentUser={user} bookTitle={bookTitle} onClose={() => { setShowUpload(false); showToast("페이지가 올라갔어요 📖"); }} />}

      {/* Header */}
      <header style={{ background: "#1C4532", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1.3rem" }}>📖</span>
          <span style={{ fontFamily: "'Playfair Display',serif", color: "#F5E6C8", fontSize: "1.1rem", fontWeight: 600 }}>교환독서</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setShowUpload(true)}
            style={{ padding: "7px 16px", borderRadius: 20, border: "none", background: "#F5E6C8", color: "#1C4532", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
            + 페이지 올리기
          </button>
          <Avatar user={user} size={32} />
          <button onClick={handleLogout} style={{ background: "none", border: "none", cursor: "pointer", color: "#A3C4A8", fontSize: "0.75rem", fontFamily: "'DM Sans',sans-serif" }}>로그아웃</button>
        </div>
      </header>

      {/* 책 배너 */}
      <div style={{ background: "#2D6A4F", padding: "0.85rem 1.5rem", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 52, background: "#1C4532", borderRadius: "3px 6px 6px 3px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", boxShadow: "inset -3px 0 6px rgba(0,0,0,0.3)", flexShrink: 0 }}>📗</div>
        <div style={{ flex: 1 }}>
          {editingBook ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={bookDraft} onChange={e => setBookDraft(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === "Enter") { setBookTitle(bookDraft); setEditingBook(false); showToast("책 제목이 바뀌었어요 📗"); } if (e.key === "Escape") setEditingBook(false); }}
                style={{ flex: 1, padding: "4px 10px", borderRadius: 6, border: "1px solid #A3C4A8", background: "rgba(255,255,255,0.15)", color: "#F5E6C8", fontFamily: "'Playfair Display',serif", fontSize: "0.9rem", outline: "none" }} />
              <button onClick={() => { setBookTitle(bookDraft); setEditingBook(false); showToast("책 제목이 바뀌었어요 📗"); }} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#F5E6C8", color: "#1C4532", cursor: "pointer", fontSize: "0.78rem" }}>저장</button>
              <button onClick={() => setEditingBook(false)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#A3C4A8", cursor: "pointer", fontSize: "0.78rem" }}>취소</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", color: "#F5E6C8", fontSize: "0.95rem", fontWeight: 600 }}>{bookTitle}</div>
              <button onClick={() => { setBookDraft(bookTitle); setEditingBook(true); }}
                style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#A3C4A8", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                ✏️ 수정
              </button>
            </div>
          )}
          <div style={{ color: "#A3C4A8", fontSize: "0.72rem", marginTop: 2 }}>포스트 {posts.length}개 · 멤버 {[...new Set(posts.map(p => p.authorUid))].length}명</div>
        </div>
      </div>

      {/* 피드 */}
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem" }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "5rem 2rem", color: "#9CA3AF" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📚</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.1rem", color: "#1C4532", marginBottom: "0.5rem" }}>아직 올라온 페이지가 없어요</div>
            <div style={{ fontSize: "0.85rem", lineHeight: 1.7 }}>마음에 든 책 페이지를 사진으로 찍어 제일 먼저 올려보세요!</div>
            <button onClick={() => setShowUpload(true)}
              style={{ marginTop: "1.5rem", padding: "10px 24px", borderRadius: 20, border: "none", background: "#1C4532", color: "#F5E6C8", cursor: "pointer", fontSize: "0.88rem", fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>
              + 첫 페이지 올리기
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {posts.map(post => <PostCard key={post.id} post={post} currentUser={user} />)}
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D1C9B8; border-radius: 10px; }
      `}</style>
    </div>
  );
}
