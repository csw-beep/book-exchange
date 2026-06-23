import { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCKlrRaO7XCKpWhlE5lloogrjvyK5ssjmo",
  authDomain: "book-exchange-12639.firebaseapp.com",
  projectId: "book-exchange-12639",
  storageBucket: "book-exchange-12639.firebasestorage.app",
  messagingSenderId: "232667258960",
  appId: "1:232667258960:web:929f7b1206c594ff4c7155",
};
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── 디자인 토큰 ───────────────────────────────────────────────────────────────
const T = {
  bg:       "#F5F2EC",
  surface:  "#EDEAE3",
  white:    "#FFFFFF",
  black:    "#111111",
  gray1:    "#333333",
  gray2:    "#666666",
  gray3:    "#999999",
  gray4:    "#CCCCCC",
  gray5:    "#E8E5DF",
  accent:   "#111111",
  danger:   "#C0392B",
  fontSans: "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif",
  fontSerif:"'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif",
};

// ── 이미지 압축 ───────────────────────────────────────────────────────────────
async function compressImage(file, maxSizeKB = 700) {
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > 1200) { h = Math.round(h * 1200 / w); w = 1200; }
      if (h > 1600) { w = Math.round(w * 1600 / h); h = 1600; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let q = 0.85;
      const run = () => {
        const d = canvas.toDataURL("image/jpeg", q);
        if ((d.length * 3 / 4 / 1024) <= maxSizeKB || q <= 0.3) { URL.revokeObjectURL(url); res(d); }
        else { q -= 0.1; run(); }
      };
      run();
    };
    img.src = url;
  });
}

// ── 상수 ─────────────────────────────────────────────────────────────────────
const EMOJIS = ["❤️","🔥","💡","🤔","😮","👏"];
const COLORS = [
  { id:"black",  color:"#111111" },
  { id:"gray",   color:"#888888" },
  { id:"brown",  color:"#8B6550" },
  { id:"green",  color:"#4A7C59" },
  { id:"navy",   color:"#2C3E6B" },
];
const getColor = (id) => COLORS.find(c => c.id === id) || COLORS[0];
const makeCode = () => Math.random().toString(36).substring(2,8).toUpperCase();
// ── 책 검색 (Open Library API) ────────────────────────────────────────────────
async function searchBooks(query) {
  const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=key,title,author_name,cover_i,first_publish_year`);
  if (!res.ok) throw new Error("검색 실패");
  const data = await res.json();
  return (data.docs || []).map(book => ({
    key:    book.key,
    title:  book.title,
    author: book.author_name?.[0] || "저자 미상",
    year:   book.first_publish_year || "",
    cover:  book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
  }));
}


// ── 공통 ─────────────────────────────────────────────────────────────────────
function Avatar({ user, size = 32 }) {
  if (!user) return null;
  return user.photoURL
    ? <img src={user.photoURL} alt="" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
    : <div style={{ width:size, height:size, borderRadius:"50%", background:T.black, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.38, fontWeight:700, flexShrink:0, fontFamily:T.fontSans }}>
        {(user.displayName||"?")[0]}
      </div>;
}

function Divider() { return <div style={{ height:1, background:T.gray5, margin:"0" }} />; }

function PillButton({ children, onClick, primary, danger, disabled, style={} }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"14px 28px", borderRadius:100, border:"none", cursor:disabled?"default":"pointer", fontSize:"0.95rem", fontWeight:600, fontFamily:T.fontSans, letterSpacing:"-0.01em", transition:"opacity 0.15s",
        background: danger ? T.danger : primary ? T.black : T.surface,
        color: danger||primary ? "#fff" : T.gray2,
        opacity: disabled ? 0.4 : 1,
        ...style }}>
      {children}
    </button>
  );
}

function Sheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300 }}>
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.3)", backdropFilter:"blur(4px)" }} onClick={onClose} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, background:T.white, borderRadius:"20px 20px 0 0", paddingBottom:"calc(2rem + env(safe-area-inset-bottom,0px))", maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"1.25rem 1.5rem 1rem" }}>
          {title && <div style={{ fontSize:"1rem", fontWeight:700, color:T.black, fontFamily:T.fontSans }}>{title}</div>}
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray3, fontSize:"1.1rem", marginLeft:"auto", padding:4 }}>✕</button>
        </div>
        <div style={{ padding:"0 1.5rem" }}>{children}</div>
      </div>
    </div>
  );
}

// ── 로그인 ────────────────────────────────────────────────────────────────────
function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const login = async () => {
    setLoading(true); setError(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch { setError("로그인에 실패했어요."); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight:"100dvh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"2rem", fontFamily:T.fontSans }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      <div style={{ width:"100%", maxWidth:360, textAlign:"center" }}>
        <div style={{ fontSize:"2.8rem", marginBottom:"1.5rem" }}>📖</div>
        <h1 style={{ fontFamily:T.fontSerif, fontSize:"2rem", fontWeight:600, color:T.black, margin:"0 0 0.75rem", letterSpacing:"-0.02em" }}>교환독서</h1>
        <p style={{ color:T.gray2, fontSize:"0.95rem", lineHeight:1.7, margin:"0 0 2.5rem" }}>마음에 든 페이지를 올리고<br/>함께 코멘트를 나눠보세요</p>
        {error && <div style={{ background:"#FEE", color:T.danger, fontSize:"0.85rem", padding:"10px 14px", borderRadius:12, marginBottom:"1rem" }}>{error}</div>}
        <button onClick={login} disabled={loading}
          style={{ width:"100%", padding:"1rem", borderRadius:14, border:`1.5px solid ${T.gray4}`, background:T.white, cursor:loading?"default":"pointer", fontSize:"0.95rem", fontFamily:T.fontSans, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:10, color:T.gray1 }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.2 33.6 29.7 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.1-6.1C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.9 0 20-7.9 20-21 0-1.3-.1-2.7-.5-4z"/></svg>
          {loading ? "로그인 중…" : "Google로 계속하기"}
        </button>
      </div>
    </div>
  );
}

// ── 모임 목록 ─────────────────────────────────────────────────────────────────
function RoomList({ user, onEnter }) {
  const [rooms, setRooms]           = useState([]);
  const [view, setView]             = useState("list"); // list|create|join
  const [newTitle, setNewTitle]     = useState("");
  const [newAuthor, setNewAuthor]   = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [joinCode, setJoinCode]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuRoom, setMenuRoom]     = useState(null);
  const [editRoom, setEditRoom]     = useState(null);
  const [editTitle, setEditTitle]   = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  useEffect(() => {
    const q = query(collection(db, "rooms"), where("memberUids","array-contains",user.uid));
    return onSnapshot(q, snap => setRooms(snap.docs.map(d => ({id:d.id,...d.data()}))));
  }, [user.uid]);

  const createRoom = async () => {
    if (!newTitle.trim()) return;
    setLoading(true); setError(null);
    try {
      const inviteCode = makeCode();
      const ref = await addDoc(collection(db,"rooms"), {
        title: newTitle.trim(), author: newAuthor.trim(), dueDate: newDueDate.trim(), inviteCode,
        ownerUid: user.uid, memberUids: [user.uid],
        members: [{uid:user.uid, name:user.displayName, photo:user.photoURL||null}],
        postCount: 0, status:"active", createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      });
      setView("list"); setNewTitle(""); setNewAuthor(""); setNewDueDate("");
      onEnter({id:ref.id, title:newTitle.trim(), author:newAuthor.trim(), dueDate:newDueDate.trim(), inviteCode, ownerUid:user.uid, memberUids:[user.uid], postCount:0, status:"active"});
    } catch { setError("모임 만들기에 실패했어요."); }
    finally { setLoading(false); }
  };

  const joinRoom = async () => {
    if (joinCode.length < 6) return;
    setLoading(true); setError(null);
    try {
      const q = query(collection(db,"rooms"), where("inviteCode","==",joinCode.toUpperCase()));
      const snap = await new Promise(res => { const u = onSnapshot(q, s => { u(); res(s); }); });
      if (snap.empty) { setError("존재하지 않는 코드예요."); setLoading(false); return; }
      const d = snap.docs[0]; const room = {id:d.id,...d.data()};
      if (!room.memberUids.includes(user.uid)) {
        await updateDoc(doc(db,"rooms",room.id), { memberUids:arrayUnion(user.uid), members:arrayUnion({uid:user.uid,name:user.displayName,photo:user.photoURL||null}), updatedAt:serverTimestamp() });
      }
      setView("list"); setJoinCode(""); onEnter({...room,id:d.id});
    } catch { setError("참여에 실패했어요."); }
    finally { setLoading(false); }
  };

  const deleteRoom  = async (r) => { if (!window.confirm(`"${r.title}" 모임을 삭제할까요?`)) return; await deleteDoc(doc(db,"rooms",r.id)); setMenuRoom(null); };
  const leaveRoom   = async (r) => { if (!window.confirm(`"${r.title}" 모임에서 나갈까요?`)) return; await updateDoc(doc(db,"rooms",r.id),{memberUids:arrayRemove(user.uid)}); setMenuRoom(null); };
  const toggleStatus= async (r) => { await updateDoc(doc(db,"rooms",r.id),{status:r.status==="done"?"active":"done",updatedAt:serverTimestamp()}); setMenuRoom(null); };
  const saveEdit    = async ()  => { if (!editTitle.trim()) return; await updateDoc(doc(db,"rooms",editRoom.id),{title:editTitle.trim(),author:editAuthor.trim(),dueDate:editDueDate.trim(),updatedAt:serverTimestamp()}); setEditRoom(null); };

  const inp = { width:"100%", padding:"14px 16px", borderRadius:12, border:`1.5px solid ${T.gray4}`, fontFamily:T.fontSans, fontSize:"1rem", outline:"none", background:T.white, boxSizing:"border-box", color:T.black };

  // 수정 시트
  if (editRoom) return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      <div style={{ padding:"env(safe-area-inset-top,0px) 0 0" }}>
        <div style={{ display:"flex", alignItems:"center", padding:"1rem 1.5rem", gap:12 }}>
          <button onClick={() => setEditRoom(null)} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray2, fontSize:"0.95rem", fontFamily:T.fontSans, padding:0 }}>← 취소</button>
          <div style={{ flex:1, textAlign:"center", fontWeight:700, fontSize:"1rem", color:T.black }}>모임 수정</div>
          <button onClick={saveEdit} disabled={!editTitle.trim()} style={{ background:"none", border:"none", cursor:"pointer", color:editTitle.trim()?T.black:T.gray3, fontSize:"0.95rem", fontWeight:700, fontFamily:T.fontSans, padding:0 }}>저장</button>
        </div>
        <Divider />
        <div style={{ padding:"2rem 1.5rem", display:"flex", flexDirection:"column", gap:12 }}>
          <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="책 제목" style={inp} />
          <input value={editAuthor} onChange={e=>setEditAuthor(e.target.value)} placeholder="저자 (선택)" style={inp} />
          <div>
            <div style={{ fontSize:"0.78rem", color:T.gray2, marginBottom:6, fontWeight:500 }}>완독 목표일</div>
            <input type="date" value={editDueDate} onChange={e=>setEditDueDate(e.target.value)} style={inp} />
          </div>
        </div>
      </div>
    </div>
  );

  // 모임 만들기
  if (view === "create") return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      <div style={{ padding:"env(safe-area-inset-top,0px) 0 0" }}>
        <div style={{ display:"flex", alignItems:"center", padding:"1rem 1.5rem", gap:12 }}>
          <button onClick={() => { setView("list"); setError(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray2, fontSize:"0.95rem", fontFamily:T.fontSans, padding:0 }}>← 취소</button>
          <div style={{ flex:1, textAlign:"center", fontWeight:700, fontSize:"1rem", color:T.black }}>새 모임</div>
          <div style={{ width:40 }} />
        </div>
        <Divider />
        <div style={{ padding:"2rem 1.5rem", display:"flex", flexDirection:"column", gap:12 }}>
          {/* 책 검색 */}
          {(() => {
            const [searchQ, setSearchQ] = useState("");
            const [results, setResults] = useState([]);
            const [searching, setSearching] = useState(false);
            const [selectedBook, setSelectedBook] = useState(null);
            const search = async () => {
              if (!searchQ.trim()) return;
              setSearching(true);
              try { const r = await searchBooks(searchQ); setResults(r); } catch {}
              finally { setSearching(false); }
            };
            const pick = (book) => {
              setSelectedBook(book);
              setNewTitle(book.title);
              setNewAuthor(book.author);
              setResults([]);
              setSearchQ("");
            };
            return (
              <div>
                <div style={{ fontSize:"0.78rem", color:T.gray2, marginBottom:6, fontWeight:500 }}>책 검색</div>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
                    placeholder="책 제목으로 검색…" style={{ ...inp, flex:1 }} />
                  <button onClick={search} disabled={searching}
                    style={{ padding:"14px 16px", borderRadius:12, border:"none", background:T.black, color:"#fff", cursor:"pointer", fontSize:"0.88rem", fontFamily:T.fontSans, whiteSpace:"nowrap" }}>
                    {searching?"…":"검색"}
                  </button>
                </div>
                {results.length > 0 && (
                  <div style={{ marginTop:8, border:`1px solid ${T.gray5}`, borderRadius:12, overflow:"hidden", maxHeight:260, overflowY:"auto" }}>
                    {results.map((book, i) => (
                      <div key={book.key} onClick={()=>pick(book)}
                        style={{ display:"flex", gap:10, padding:"10px 12px", cursor:"pointer", background:T.white, borderBottom:i<results.length-1?`1px solid ${T.gray5}`:"none", alignItems:"center" }}>
                        {book.cover
                          ? <img src={book.cover} alt="" style={{ width:32, height:44, objectFit:"cover", borderRadius:4, flexShrink:0 }} />
                          : <div style={{ width:32, height:44, background:T.surface, borderRadius:4, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem" }}>📖</div>}
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:"0.88rem", fontWeight:600, color:T.black, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.title}</div>
                          <div style={{ fontSize:"0.75rem", color:T.gray2, marginTop:2 }}>{book.author}{book.year?` · ${book.year}`:""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedBook && (
                  <div style={{ display:"flex", gap:10, padding:"10px 12px", background:T.surface, borderRadius:12, marginTop:6, alignItems:"center" }}>
                    {selectedBook.cover && <img src={selectedBook.cover} alt="" style={{ width:32, height:44, objectFit:"cover", borderRadius:4, flexShrink:0 }} />}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:"0.85rem", fontWeight:600, color:T.black, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedBook.title}</div>
                      <div style={{ fontSize:"0.75rem", color:T.gray2 }}>{selectedBook.author}</div>
                    </div>
                    <button onClick={()=>{setSelectedBook(null);setNewTitle("");setNewAuthor("");}} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray3, fontSize:"1rem" }}>✕</button>
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ display:"flex", gap:8 }}>
            <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="책 제목 *" style={{ ...inp, flex:2 }} />
            <input value={newAuthor} onChange={e=>setNewAuthor(e.target.value)} placeholder="저자" style={{ ...inp, flex:1 }} />
          </div>
          <div>
            <div style={{ fontSize:"0.78rem", color:T.gray2, marginBottom:6, fontWeight:500 }}>완독 목표일 (선택)</div>
            <input type="date" value={newDueDate} onChange={e=>setNewDueDate(e.target.value)} style={inp} />
          </div>
          {error && <div style={{ color:T.danger, fontSize:"0.85rem" }}>{error}</div>}
        </div>
        <div style={{ padding:"0 1.5rem" }}>
          <PillButton primary onClick={createRoom} disabled={!newTitle.trim()||loading} style={{ width:"100%" }}>
            {loading ? "만드는 중…" : "모임 만들기"}
          </PillButton>
        </div>
      </div>
    </div>
  );

  // 코드 참여
  if (view === "join") return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      <div style={{ padding:"env(safe-area-inset-top,0px) 0 0" }}>
        <div style={{ display:"flex", alignItems:"center", padding:"1rem 1.5rem", gap:12 }}>
          <button onClick={() => { setView("list"); setError(null); setJoinCode(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray2, fontSize:"0.95rem", fontFamily:T.fontSans, padding:0 }}>← 취소</button>
          <div style={{ flex:1, textAlign:"center", fontWeight:700, fontSize:"1rem", color:T.black }}>코드로 참여</div>
          <div style={{ width:40 }} />
        </div>
        <Divider />
        <div style={{ padding:"2.5rem 1.5rem", display:"flex", flexDirection:"column", gap:12 }}>
          <p style={{ color:T.gray2, fontSize:"0.9rem", margin:"0 0 1rem", lineHeight:1.6 }}>친구에게 받은 6자리 초대코드를 입력해주세요.</p>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="XXXXXX" maxLength={6}
            style={{ ...inp, textAlign:"center", fontSize:"1.8rem", fontWeight:700, letterSpacing:"0.25em" }} autoFocus />
          {error && <div style={{ color:T.danger, fontSize:"0.85rem" }}>{error}</div>}
        </div>
        <div style={{ padding:"0 1.5rem" }}>
          <PillButton primary onClick={joinRoom} disabled={joinCode.length<6||loading} style={{ width:"100%" }}>
            {loading ? "참여 중…" : "참여하기"}
          </PillButton>
        </div>
      </div>
    </div>
  );

  // 모임 목록 메인
  return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />

      {/* 프로필 시트 */}
      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title="프로필">
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:"1.5rem" }}>
          <Avatar user={user} size={52} />
          <div>
            <div style={{ fontWeight:700, fontSize:"1rem", color:T.black }}>{user.displayName}</div>
            <div style={{ fontSize:"0.82rem", color:T.gray2, marginTop:2 }}>{user.email}</div>
          </div>
        </div>
        <PillButton danger onClick={() => { signOut(auth); setProfileOpen(false); }} style={{ width:"100%", marginBottom:"0.5rem" }}>로그아웃</PillButton>
      </Sheet>

      {/* 모임 메뉴 시트 */}
      <Sheet open={!!menuRoom} onClose={() => setMenuRoom(null)}>
        {menuRoom && (
          <div style={{ display:"flex", flexDirection:"column" }}>
            <div style={{ fontFamily:T.fontSerif, fontSize:"1rem", fontWeight:600, color:T.black, marginBottom:"1.25rem", lineHeight:1.4 }}>{menuRoom.title}</div>
            {menuRoom.ownerUid === user.uid && <>
              <button onClick={() => { setEditRoom(menuRoom); setEditTitle(menuRoom.title); setEditAuthor(menuRoom.author||""); setEditDueDate(menuRoom.dueDate||""); setMenuRoom(null); }}
                style={{ padding:"16px 0", background:"none", border:"none", cursor:"pointer", fontSize:"1rem", fontFamily:T.fontSans, color:T.black, textAlign:"left", borderBottom:`1px solid ${T.gray5}` }}>수정하기</button>
              <button onClick={() => toggleStatus(menuRoom)}
                style={{ padding:"16px 0", background:"none", border:"none", cursor:"pointer", fontSize:"1rem", fontFamily:T.fontSans, color:T.black, textAlign:"left", borderBottom:`1px solid ${T.gray5}` }}>
                {menuRoom.status==="done" ? "다시 진행중으로" : "완료로 표시"}
              </button>
              <button onClick={() => deleteRoom(menuRoom)}
                style={{ padding:"16px 0", background:"none", border:"none", cursor:"pointer", fontSize:"1rem", fontFamily:T.fontSans, color:T.danger, textAlign:"left" }}>삭제하기</button>
            </>}
            {menuRoom.ownerUid !== user.uid && (
              <button onClick={() => leaveRoom(menuRoom)}
                style={{ padding:"16px 0", background:"none", border:"none", cursor:"pointer", fontSize:"1rem", fontFamily:T.fontSans, color:T.danger, textAlign:"left" }}>나가기</button>
            )}
          </div>
        )}
      </Sheet>

      {/* 헤더 */}
      <div style={{ padding:"calc(env(safe-area-inset-top,0px) + 1.25rem) 1.5rem 1rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <h1 style={{ fontFamily:T.fontSerif, fontSize:"1.5rem", fontWeight:600, color:T.black, margin:0, letterSpacing:"-0.02em" }}>교환독서</h1>
        <button onClick={() => setProfileOpen(true)} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
          <Avatar user={user} size={34} />
        </button>
      </div>

      <Divider />

      {/* 모임 목록 */}
      <div style={{ padding:"0.5rem 0" }}>
        {rooms.length === 0 && (
          <div style={{ padding:"4rem 2rem", textAlign:"center" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>📚</div>
            <p style={{ color:T.gray2, fontSize:"0.95rem", lineHeight:1.7, margin:0 }}>아직 참여한 모임이 없어요.<br/>새 모임을 만들거나 초대코드로 참여해보세요.</p>
          </div>
        )}
        {rooms.map(room => (
          <div key={room.id}>
            <div style={{ display:"flex", alignItems:"center", padding:"1.1rem 1.5rem", gap:14, cursor:"pointer" }} onClick={() => onEnter(room)}>
              {/* 책 아이콘 */}
              <div style={{ width:42, height:56, background:room.status==="done"?T.gray3:T.black, borderRadius:"3px 6px 6px 3px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.2rem", flexShrink:0, boxShadow:"inset -2px 0 4px rgba(0,0,0,0.2)" }}>
                {room.status==="done"?"📘":"📗"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:T.fontSerif, fontSize:"1rem", fontWeight:600, color:T.black, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{room.title}</div>
                {room.author && <div style={{ fontSize:"0.82rem", color:T.gray2, marginBottom:4 }}>{room.author}</div>}
                <div style={{ fontSize:"0.78rem", color:T.gray3, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  {room.dueDate && (() => {
                    const due = new Date(room.dueDate);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const diff = Math.ceil((due - today) / 86400000);
                    const label = due.toLocaleDateString("ko-KR",{month:"long",day:"numeric"});
                    const dTag = diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : `D+${Math.abs(diff)}`;
                    const tagColor = diff < 0 ? T.gray3 : diff <= 7 ? "#C0392B" : T.black;
                    return <><span style={{ fontWeight:600, color:tagColor }}>{dTag}</span><span>·</span><span>{label}</span><span>·</span></>;
                  })()}
                  <span>멤버 {room.memberUids?.length||1}명</span>
                  <span>·</span>
                  <span>포스트 {room.postCount||0}개</span>
                  {room.status==="done" && <><span>·</span><span>완료</span></>}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); setMenuRoom(room); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:T.gray3, fontSize:"1.3rem", padding:"4px 8px", minHeight:44, flexShrink:0 }}>⋯</button>
            </div>
            <Divider />
          </div>
        ))}
      </div>

      {/* 하단 pill 버튼 */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"1rem 1.5rem", paddingBottom:"calc(1rem + env(safe-area-inset-bottom,0px))", background:`linear-gradient(transparent, ${T.bg} 40%)`, display:"flex", gap:10, justifyContent:"center" }}>
        <PillButton onClick={() => setView("create")} primary style={{ flex:1 }}>새 모임</PillButton>
        <PillButton onClick={() => setView("join")} style={{ flex:1 }}>코드 참여</PillButton>
      </div>

      <div style={{ height:"calc(80px + env(safe-area-inset-bottom,0px))" }} />
      <style>{`* { -webkit-tap-highlight-color:transparent; } input,textarea,button{-webkit-appearance:none;}`}</style>
    </div>
  );
}

// ── 업로드 ────────────────────────────────────────────────────────────────────
function UploadScreen({ user, room, onClose }) {
  const [mode, setMode]         = useState("photo"); // photo | text
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [quote, setQuote]       = useState("");   // 직접 타이핑한 인용 문장
  const [caption, setCaption]   = useState("");   // 이 페이지를 고른 이유
  const [colorId, setColorId]   = useState("black");
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState(null);
  const camRef = useRef(null);
  const galRef = useRef(null);

  const pick = (f) => { if(!f) return; setFile(f); setPreview(URL.createObjectURL(f)); };

  const canSubmit = mode === "photo"
    ? (file && caption.trim())
    : (quote.trim() && caption.trim());

  const submit = async () => {
    if (!canSubmit) return;
    setUploading(true); setError(null);
    try {
      const postData = {
        authorUid: user.uid, authorName: user.displayName, authorPhoto: user.photoURL||null,
        caption: caption.trim(), colorId, reactions:{}, comments:[], createdAt: serverTimestamp(),
        type: mode,
      };
      if (mode === "photo") {
        postData.imageDataUrl = await compressImage(file);
      } else {
        postData.quote = quote.trim();
      }
      await addDoc(collection(db,"rooms",room.id,"posts"), postData);
      await updateDoc(doc(db,"rooms",room.id), { postCount:(room.postCount||0)+1, updatedAt:serverTimestamp() });
      onClose();
    } catch { setError("업로드에 실패했어요."); }
    finally { setUploading(false); }
  };

  const taStyle = { width:"100%", padding:"14px 16px", borderRadius:12, border:`1.5px solid ${T.gray4}`, fontFamily:T.fontSans, fontSize:"1rem", outline:"none", background:T.white, lineHeight:1.7, resize:"vertical", boxSizing:"border-box", color:T.black };

  return (
    <div style={{ position:"fixed", inset:0, background:T.bg, zIndex:200, display:"flex", flexDirection:"column", fontFamily:T.fontSans }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />

      {/* 헤더 */}
      <div style={{ padding:"calc(env(safe-area-inset-top,0px) + 1rem) 1.5rem 1rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray2, fontSize:"0.95rem", fontFamily:T.fontSans, padding:0 }}>취소</button>
        <div style={{ fontWeight:700, fontSize:"1rem", color:T.black }}>페이지 올리기</div>
        <button onClick={submit} disabled={!canSubmit||uploading}
          style={{ background:"none", border:"none", cursor:"pointer", color:!canSubmit||uploading?T.gray3:T.black, fontSize:"0.95rem", fontWeight:700, fontFamily:T.fontSans, padding:0 }}>
          {uploading?"올리는 중…":"올리기"}
        </button>
      </div>
      <Divider />

      {/* 모드 탭 */}
      <div style={{ display:"flex", padding:"0.75rem 1.5rem", gap:8 }}>
        {[{id:"photo",label:"📷 사진"},{id:"text",label:"✍️ 텍스트"}].map(tab => (
          <button key={tab.id} onClick={() => setMode(tab.id)}
            style={{ flex:1, padding:"10px", borderRadius:10, border:"none", cursor:"pointer", fontSize:"0.9rem", fontWeight:600, fontFamily:T.fontSans,
              background: mode===tab.id ? T.black : T.surface,
              color: mode===tab.id ? "#fff" : T.gray2,
              transition:"all 0.15s" }}>
            {tab.label}
          </button>
        ))}
      </div>
      <Divider />

      <div style={{ flex:1, overflowY:"auto", padding:"1.25rem 1.5rem" }}>

        {/* 사진 모드 */}
        {mode === "photo" && (
          !preview ? (
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:"1.5rem" }}>
              <button onClick={() => camRef.current?.click()}
                style={{ width:"100%", padding:"1.25rem", borderRadius:14, border:"none", background:T.black, color:"#fff", cursor:"pointer", fontSize:"1rem", fontWeight:600, fontFamily:T.fontSans }}>
                📷 카메라로 찍기
              </button>
              <button onClick={() => galRef.current?.click()}
                style={{ width:"100%", padding:"1.25rem", borderRadius:14, border:`1.5px solid ${T.gray4}`, background:T.white, color:T.black, cursor:"pointer", fontSize:"1rem", fontWeight:500, fontFamily:T.fontSans }}>
                🖼 갤러리에서 선택
              </button>
              <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={e=>pick(e.target.files[0])} style={{display:"none"}} />
              <input ref={galRef} type="file" accept="image/*" onChange={e=>pick(e.target.files[0])} style={{display:"none"}} />
            </div>
          ) : (
            <div style={{ position:"relative", marginBottom:"1.5rem" }}>
              <img src={preview} alt="" style={{ width:"100%", borderRadius:14, maxHeight:320, objectFit:"contain", background:T.surface, display:"block" }} />
              <button onClick={() => { setFile(null); setPreview(null); }}
                style={{ position:"absolute", top:10, right:10, background:"rgba(0,0,0,0.5)", color:"#fff", border:"none", borderRadius:"50%", width:32, height:32, cursor:"pointer", fontSize:"0.85rem", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>
          )
        )}

        {/* 텍스트 모드 */}
        {mode === "text" && (
          <div style={{ marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"0.8rem", fontWeight:600, color:T.gray2, marginBottom:8 }}>인용할 문단</div>
            <textarea value={quote} onChange={e=>setQuote(e.target.value)}
              placeholder={"마음에 든 문장이나 문단을 직접 입력해주세요.\n\n예: \"우리는 왜 이토록 타인의 시선에서 자유롭지 못한 것일까.\""}
              style={{ ...taStyle, minHeight:160, fontStyle: quote ? "normal" : "normal" }} autoFocus />
            {quote.trim() && (
              <div style={{ marginTop:10, padding:"14px 16px", borderRadius:12, background:T.surface, borderLeft:`3px solid ${getColor(colorId).color}` }}>
                <div style={{ fontSize:"0.72rem", color:T.gray3, marginBottom:6 }}>미리보기</div>
                <p style={{ fontSize:"0.95rem", color:T.gray1, lineHeight:1.75, margin:0, fontStyle:"italic" }}>"{quote.trim()}"</p>
              </div>
            )}
          </div>
        )}

        {/* 이 페이지를 고른 이유 */}
        <div style={{ marginBottom:"1.5rem" }}>
          <div style={{ fontSize:"0.8rem", fontWeight:600, color:T.gray2, marginBottom:8 }}>
            {mode==="photo" ? "이 페이지를 고른 이유" : "이 문단에 대한 생각"}
          </div>
          <textarea value={caption} onChange={e=>setCaption(e.target.value)}
            placeholder={mode==="photo" ? "어떤 부분이 마음에 들었나요?" : "이 문장이 왜 마음에 들었나요?"}
            style={{ ...taStyle, minHeight:100 }} />
        </div>

        {/* 색상 */}
        <div style={{ marginBottom:"1.5rem" }}>
          <div style={{ fontSize:"0.8rem", fontWeight:600, color:T.gray2, marginBottom:10 }}>카드 색상</div>
          <div style={{ display:"flex", gap:12 }}>
            {COLORS.map(c => (
              <button key={c.id} onClick={() => setColorId(c.id)}
                style={{ width:32, height:32, borderRadius:"50%", background:c.color, border:colorId===c.id?`3px solid ${T.black}`:"3px solid transparent", cursor:"pointer", outline:colorId===c.id?`2px solid ${T.white}`:"none", outlineOffset:1 }} />
            ))}
          </div>
        </div>

        {error && <div style={{ color:T.danger, fontSize:"0.85rem", marginBottom:"1rem" }}>{error}</div>}
        <div style={{ height:"env(safe-area-inset-bottom,20px)" }} />
      </div>
    </div>
  );
}

// ── 코멘트 스레드 ─────────────────────────────────────────────────────────────
function CommentThread({ comment, currentUser, onReact, onAddReply }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const submit = () => { if(!replyText.trim()) return; onAddReply(replyText.trim()); setReplyText(""); setShowReply(false); };
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        <Avatar user={{uid:comment.authorUid,displayName:comment.authorName,photoURL:comment.authorPhoto}} size={26} />
        <div style={{ flex:1 }}>
          <div style={{ background:T.surface, borderRadius:"4px 12px 12px 12px", padding:"9px 13px" }}>
            <span style={{ fontSize:"0.82rem", fontWeight:700, color:T.black, marginRight:6 }}>{comment.authorName}</span>
            <span style={{ fontSize:"0.9rem", color:T.gray1 }}>{comment.text}</span>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:5, paddingLeft:2, alignItems:"center", flexWrap:"wrap" }}>
            {EMOJIS.map(e => {
              const who = comment.reactions?.[e]||[]; if(!who.length) return null;
              const mine = who.includes(currentUser.uid);
              return <button key={e} onClick={()=>onReact(e)} style={{ padding:"2px 8px", borderRadius:20, border:mine?`1.5px solid ${T.black}`:`1.5px solid ${T.gray4}`, background:mine?T.black:"transparent", color:mine?"#fff":T.gray2, cursor:"pointer", fontSize:"0.75rem", display:"flex", alignItems:"center", gap:2, fontFamily:T.fontSans }}>{e} {who.length}</button>;
            })}
            <button onClick={()=>setShowReply(p=>!p)} style={{ fontSize:"0.78rem", color:T.gray3, background:"none", border:"none", cursor:"pointer", padding:"3px 0", fontFamily:T.fontSans }}>
              {(comment.replies?.length||0)>0?`대댓글 ${comment.replies.length}개`:"대댓글"}
            </button>
          </div>
          {(comment.replies||[]).map(r => (
            <div key={r.id} style={{ display:"flex", gap:8, marginTop:8, paddingLeft:4 }}>
              <Avatar user={{uid:r.authorUid,displayName:r.authorName,photoURL:r.authorPhoto}} size={20} />
              <div style={{ background:T.gray5, borderRadius:"4px 10px 10px 10px", padding:"7px 11px", flex:1 }}>
                <span style={{ fontSize:"0.75rem", fontWeight:700, color:T.black, marginRight:5 }}>{r.authorName}</span>
                <span style={{ fontSize:"0.85rem", color:T.gray1 }}>{r.text}</span>
              </div>
            </div>
          ))}
          {showReply && (
            <div style={{ display:"flex", gap:6, marginTop:8, paddingLeft:4 }}>
              <Avatar user={currentUser} size={20} />
              <input value={replyText} onChange={e=>setReplyText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="대댓글…" autoFocus
                style={{ flex:1, padding:"7px 12px", borderRadius:16, border:`1.5px solid ${T.gray4}`, fontFamily:T.fontSans, fontSize:"0.9rem", outline:"none", background:T.white }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 포스트 카드 ───────────────────────────────────────────────────────────────
function PostCard({ post, room, currentUser }) {
  const [expanded, setExpanded]       = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [editing, setEditing]         = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption);
  const [editColorId, setEditColorId] = useState(post.colorId);
  const [saving, setSaving]           = useState(false);
  const col     = getColor(editing?editColorId:post.colorId);
  const isMine  = post.authorUid===currentUser.uid;
  const postRef = doc(db,"rooms",room.id,"posts",post.id);

  const react = async(emoji) => {
    const f=`reactions.${emoji}`, who=post.reactions?.[emoji]||[];
    if(who.includes(currentUser.uid)) await updateDoc(postRef,{[f]:arrayRemove(currentUser.uid)});
    else await updateDoc(postRef,{[f]:arrayUnion(currentUser.uid)});
  };
  const addComment = async(text) => await updateDoc(postRef,{comments:arrayUnion({id:Date.now().toString(),authorUid:currentUser.uid,authorName:currentUser.displayName,authorPhoto:currentUser.photoURL||null,text,createdAt:new Date().toISOString(),reactions:{},replies:[]})});
  const reactComment = async(cid,emoji) => { const updated=(post.comments||[]).map(c=>{if(c.id!==cid)return c;const who=c.reactions?.[emoji]||[];return{...c,reactions:{...c.reactions,[emoji]:who.includes(currentUser.uid)?who.filter(u=>u!==currentUser.uid):[...who,currentUser.uid]}};});await updateDoc(postRef,{comments:updated}); };
  const addReply = async(cid,text) => { const updated=(post.comments||[]).map(c=>c.id!==cid?c:{...c,replies:[...(c.replies||[]),{id:Date.now().toString(),authorUid:currentUser.uid,authorName:currentUser.displayName,authorPhoto:currentUser.photoURL||null,text,createdAt:new Date().toISOString()}]});await updateDoc(postRef,{comments:updated}); };
  const saveEdit = async() => { setSaving(true); try{await updateDoc(postRef,{caption:editCaption.trim(),colorId:editColorId});setEditing(false);}finally{setSaving(false);} };
  const del = async() => { if(!window.confirm("포스트를 삭제할까요?"))return; await deleteDoc(postRef); };

  const createdAt = post.createdAt?.toDate?post.createdAt.toDate():new Date();
  const diff=(Date.now()-createdAt.getTime())/1000;
  const ago=diff<60?"방금":diff<3600?`${Math.floor(diff/60)}분 전`:diff<86400?`${Math.floor(diff/3600)}시간 전`:`${Math.floor(diff/86400)}일 전`;
  const cCnt=post.comments?.length||0, rCnt=(post.comments||[]).reduce((s,c)=>s+(c.replies?.length||0),0);
  const totalR=Object.values(post.reactions||{}).reduce((s,v)=>s+v.length,0);

  return (
    <div style={{ background:T.white, borderRadius:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      {/* 색상 바 */}
      <div style={{ height:3, background:col.color }} />

      {/* 이미지 or 인용 텍스트 */}
      {post.type === "text" ? (
        <div style={{ padding:"1.5rem", background:T.surface, borderBottom:`1px solid ${T.gray5}` }}>
          <p style={{ fontFamily:T.fontSans, fontSize:"1.05rem", color:T.gray1, lineHeight:1.85, margin:0, fontStyle:"italic", whiteSpace:"pre-wrap" }}>
            "{post.quote}"
          </p>
        </div>
      ) : (
      <div style={{ background:T.surface, cursor:"pointer", position:"relative" }} onClick={()=>setExpanded(p=>!p)}>
        <img src={post.imageDataUrl||post.imageUrl} alt="" style={{ width:"100%", maxHeight:expanded?600:300, objectFit:"contain", display:"block", transition:"max-height 0.3s" }} />
        {!expanded && <div style={{ position:"absolute", bottom:0, left:0, right:0, height:48, background:`linear-gradient(transparent, ${T.surface})`, display:"flex", alignItems:"flex-end", padding:"0 14px 8px" }}>
          <span style={{ fontSize:"0.72rem", color:T.gray3, fontFamily:T.fontSans }}>펼치기 ↓</span>
        </div>}
      </div>
      )}
      </div>

      {/* 본문 */}
      <div style={{ padding:"1rem 1.1rem" }}>
        {/* 작성자 */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <Avatar user={{uid:post.authorUid,displayName:post.authorName,photoURL:post.authorPhoto}} size={30} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"0.88rem", fontWeight:700, color:T.black, fontFamily:T.fontSans }}>{post.authorName}</div>
            <div style={{ fontSize:"0.72rem", color:T.gray3, fontFamily:T.fontSans }}>{ago}</div>
          </div>
          <button onClick={async()=>{
              const ref=doc(db,"users",currentUser.uid);
              const bookmarks=currentUser._bookmarks||[];
              if(bookmarks.includes(post.id)){await updateDoc(ref,{bookmarks:arrayRemove(post.id)});currentUser._bookmarks=bookmarks.filter(b=>b!==post.id);}
              else{await updateDoc(ref,{bookmarks:arrayUnion(post.id)});currentUser._bookmarks=[...bookmarks,post.id];}
              window.dispatchEvent(new CustomEvent("bookmark-change"));
            }}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:"1.1rem", padding:"4px 8px", minHeight:36 }}>
            {(currentUser._bookmarks||[]).includes(post.id) ? "🔖" : "🔖"}
          </button>
          {isMine && (
            <div style={{ position:"relative" }}>
              <button onClick={()=>setShowMenu(p=>!p)} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray3, fontSize:"1.2rem", padding:"4px 8px", minHeight:36, fontFamily:T.fontSans }}>⋯</button>
              {showMenu && (
                <div style={{ position:"absolute", right:0, top:"110%", background:T.white, border:`1px solid ${T.gray5}`, borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.1)", zIndex:50, overflow:"hidden", minWidth:130 }}>
                  <button onClick={()=>{setEditing(true);setShowMenu(false);setEditCaption(post.caption);setEditColorId(post.colorId);}}
                    style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:"0.9rem", textAlign:"left", fontFamily:T.fontSans, color:T.black, borderBottom:`1px solid ${T.gray5}` }}>수정하기</button>
                  <button onClick={()=>{setShowMenu(false);del();}}
                    style={{ width:"100%", padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:"0.9rem", textAlign:"left", fontFamily:T.fontSans, color:T.danger }}>삭제하기</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 한마디 */}
        {editing ? (
          <div style={{ marginBottom:12 }}>
            <textarea value={editCaption} onChange={e=>setEditCaption(e.target.value)}
              style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`1.5px solid ${T.gray4}`, fontFamily:T.fontSans, fontSize:"0.95rem", outline:"none", background:T.surface, lineHeight:1.7, resize:"vertical", minHeight:90, boxSizing:"border-box" }} />
            <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
              <div style={{ display:"flex", gap:8, flex:1 }}>
                {COLORS.map(c=><button key={c.id} onClick={()=>setEditColorId(c.id)} style={{ width:26, height:26, borderRadius:"50%", background:c.color, border:editColorId===c.id?`3px solid ${T.black}`:"3px solid transparent", cursor:"pointer" }} />)}
              </div>
              <button onClick={()=>setEditing(false)} style={{ padding:"7px 14px", borderRadius:20, border:`1px solid ${T.gray4}`, background:"transparent", cursor:"pointer", fontSize:"0.85rem", color:T.gray2, fontFamily:T.fontSans }}>취소</button>
              <button onClick={saveEdit} disabled={!editCaption.trim()||saving}
                style={{ padding:"7px 16px", borderRadius:20, border:"none", background:T.black, color:"#fff", cursor:"pointer", fontSize:"0.85rem", fontWeight:600, fontFamily:T.fontSans }}>
                {saving?"저장 중…":"저장"}
              </button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize:"0.95rem", color:T.gray1, lineHeight:1.75, margin:"0 0 12px", fontFamily:T.fontSans }}>{post.caption}</p>
        )}

        {/* 이모지 반응 */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
          {EMOJIS.map(e=>{
            const who=post.reactions?.[e]||[]; if(!who.length) return null;
            const mine=who.includes(currentUser.uid);
            return <button key={e} onClick={()=>react(e)} style={{ padding:"4px 10px", borderRadius:20, border:mine?`1.5px solid ${T.black}`:`1.5px solid ${T.gray4}`, background:mine?T.black:"transparent", color:mine?"#fff":T.gray2, cursor:"pointer", fontSize:"0.85rem", display:"flex", alignItems:"center", gap:3, fontFamily:T.fontSans, minHeight:32 }}>{e} <span style={{ fontSize:"0.78rem" }}>{who.length}</span></button>;
          })}
          <div style={{ position:"relative" }}>
            {(() => {
              const [open, setOpen] = useState(false);
              return <>
                <button onClick={()=>setOpen(p=>!p)} style={{ padding:"4px 12px", borderRadius:20, border:`1.5px dashed ${T.gray4}`, background:"transparent", cursor:"pointer", fontSize:"0.85rem", color:T.gray3, minHeight:32 }}>+</button>
                {open && <div style={{ position:"absolute", bottom:"120%", left:0, background:T.white, border:`1px solid ${T.gray5}`, borderRadius:14, padding:"8px 10px", display:"flex", gap:4, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:50 }}>
                  {EMOJIS.map(e=><button key={e} onClick={()=>{react(e);setOpen(false);}} style={{ background:"none", border:"none", cursor:"pointer", fontSize:"1.3rem", padding:"3px" }}>{e}</button>)}
                </div>}
              </>;
            })()}
          </div>
        </div>

        {/* 요약 바 */}
        <div style={{ display:"flex", gap:14, paddingTop:12, borderTop:`1px solid ${T.gray5}`, fontSize:"0.85rem", color:T.gray3, fontFamily:T.fontSans }}>
          {totalR>0 && <span>반응 {totalR}</span>}
          <button onClick={()=>setShowComments(p=>!p)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:"0.85rem", color:T.gray2, padding:0, fontFamily:T.fontSans, minHeight:36 }}>
            💬 {cCnt>0?`코멘트 ${cCnt}${rCnt>0?` · 대댓글 ${rCnt}`:""}` : "코멘트 달기"}
          </button>
        </div>

        {/* 코멘트 */}
        {showComments && (
          <div style={{ marginTop:14 }}>
            {(post.comments||[]).map(c=>(
              <CommentThread key={c.id} comment={c} currentUser={currentUser}
                onReact={e=>reactComment(c.id,e)} onAddReply={t=>addReply(c.id,t)} />
            ))}
            <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:10 }}>
              <Avatar user={currentUser} size={28} />
              <input onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addComment(e.target.value.trim());e.target.value="";}}}
                placeholder="코멘트 달기…"
                style={{ flex:1, padding:"10px 14px", borderRadius:22, border:`1.5px solid ${T.gray4}`, fontFamily:T.fontSans, fontSize:"0.95rem", outline:"none", background:T.surface }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 모임 피드 ─────────────────────────────────────────────────────────────────
function RoomFeed({ room, user, onBack }) {
  const [posts, setPosts]         = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showInfo, setShowInfo]   = useState(false);
  const [toast, setToast]         = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null),2200); };

  useEffect(() => {
    const q = query(collection(db,"rooms",room.id,"posts"));
    return onSnapshot(q, snap=>setPosts(snap.docs.map(d=>({id:d.id,...d.data()}))));
  }, [room.id]);

  return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans, paddingBottom:80 }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />

      {toast && <div style={{ position:"fixed", bottom:"calc(80px + env(safe-area-inset-bottom,0px))", left:"50%", transform:"translateX(-50%)", background:T.black, color:"#fff", padding:"10px 20px", borderRadius:24, fontSize:"0.88rem", zIndex:999, whiteSpace:"nowrap", fontFamily:T.fontSans, animation:"fadeUp 0.2s ease" }}>{toast}</div>}

      {showUpload && <UploadScreen user={user} room={room} onClose={()=>{setShowUpload(false);showToast("올라갔어요 📖");}} />}

      {/* 초대코드 시트 */}
      <Sheet open={showInfo} onClose={()=>setShowInfo(false)} title="초대코드">
        <p style={{ color:T.gray2, fontSize:"0.88rem", margin:"0 0 1rem", lineHeight:1.6 }}>친구에게 이 코드를 공유하면 모임에 참여할 수 있어요.</p>
        <div style={{ background:T.surface, borderRadius:14, padding:"1.25rem", textAlign:"center", marginBottom:"1rem" }}>
          <div style={{ fontSize:"2rem", fontWeight:700, color:T.black, letterSpacing:"0.2em", fontFamily:T.fontSans }}>{room.inviteCode}</div>
        </div>
        <div style={{ fontSize:"0.82rem", color:T.gray3, marginBottom:"1.25rem" }}>멤버 {room.memberUids?.length||1}명 · 포스트 {posts.length}개</div>
        <PillButton primary onClick={()=>{navigator.clipboard?.writeText(room.inviteCode);showToast("복사됐어요!");setShowInfo(false);}} style={{width:"100%",marginBottom:"0.5rem"}}>
          코드 복사
        </PillButton>
      </Sheet>

      {/* 헤더 */}
      <div style={{ padding:"calc(env(safe-area-inset-top,0px) + 1rem) 1.5rem 1rem", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray2, fontSize:"1rem", fontFamily:T.fontSans, padding:"4px 0", minHeight:44, minWidth:36 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:T.fontSerif, fontSize:"1.1rem", fontWeight:600, color:T.black, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{room.title}</div>
          {room.author && <div style={{ fontSize:"0.78rem", color:T.gray3, marginTop:1 }}>{room.author}</div>}
          {room.dueDate && (() => {
            const due = new Date(room.dueDate);
            const today = new Date(); today.setHours(0,0,0,0);
            const diff = Math.ceil((due - today) / 86400000);
            const dTag = diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : `D+${Math.abs(diff)}`;
            const label = due.toLocaleDateString("ko-KR",{month:"long",day:"numeric"});
            return <div style={{ fontSize:"0.72rem", color: diff <= 7 && diff >= 0 ? "#C0392B" : T.gray3, marginTop:1 }}>{dTag} · {label} 완독 목표</div>;
          })()}
        </div>
        <button onClick={()=>setShowInfo(true)} style={{ background:"none", border:"none", cursor:"pointer", color:T.gray2, fontSize:"0.85rem", fontFamily:T.fontSans, padding:"6px 0", minHeight:44 }}>초대코드</button>
      </div>

      <Divider />

      {/* 피드 */}
      <main style={{ maxWidth:600, margin:"0 auto", padding:"1rem 0.875rem" }}>
        {posts.length===0 ? (
          <div style={{ textAlign:"center", padding:"5rem 2rem", color:T.gray3 }}>
            <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>📚</div>
            <p style={{ fontSize:"0.95rem", lineHeight:1.7, margin:0, color:T.gray2 }}>아직 올라온 페이지가 없어요.<br/>마음에 든 책 페이지를 올려보세요!</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.875rem" }}>
            {posts.map(post=><PostCard key={post.id} post={post} room={room} currentUser={user} />)}
          </div>
        )}
      </main>

      {/* 하단 */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"1rem 1.5rem", paddingBottom:"calc(1rem + env(safe-area-inset-bottom,0px))", background:`linear-gradient(transparent, ${T.bg} 40%)`, display:"flex", gap:10, justifyContent:"center" }}>
        <PillButton onClick={onBack} style={{ flex:1 }}>← 목록</PillButton>
        <PillButton primary onClick={()=>setShowUpload(true)} style={{ flex:2 }}>+ 페이지 올리기</PillButton>
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateX(-50%) translateY(6px);}to{opacity:1;transform:translateX(-50%) translateY(0);} }
        *{-webkit-tap-highlight-color:transparent;}
        input,textarea,button{-webkit-appearance:none;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:#CCC;border-radius:10px;}
      `}</style>
    </div>
  );
}

// ── 내 서재 화면 ──────────────────────────────────────────────────────────────
function MyLibrary({ user }) {
  const [allRooms, setAllRooms]       = useState([]);
  const [bookmarks, setBookmarks]     = useState([]);
  const [allPosts, setAllPosts]       = useState([]);
  const [tab, setTab]                 = useState("history"); // history | bookmarks
  const [loadingPosts, setLoadingPosts] = useState(false);

  // 내가 참여한 모든 모임
  useEffect(() => {
    const q = query(collection(db,"rooms"), where("memberUids","array-contains",user.uid));
    return onSnapshot(q, snap => setAllRooms(snap.docs.map(d=>({id:d.id,...d.data()}))));
  }, [user.uid]);

  // 북마크 목록
  useEffect(() => {
    const unsub = onSnapshot(doc(db,"users",user.uid), snap => {
      setBookmarks(snap.data()?.bookmarks || []);
      user._bookmarks = snap.data()?.bookmarks || [];
    });
    return unsub;
  }, [user.uid]);

  // 북마크된 포스트 불러오기
  const [bookmarkedPosts, setBookmarkedPosts] = useState([]);
  useEffect(() => {
    if (!bookmarks.length) { setBookmarkedPosts([]); return; }
    // 모든 모임의 posts에서 북마크된 것 찾기
    const fetched = [];
    let done = 0;
    if (!allRooms.length) return;
    allRooms.forEach(room => {
      const q = query(collection(db,"rooms",room.id,"posts"));
      onSnapshot(q, snap => {
        snap.docs.forEach(d => {
          if (bookmarks.includes(d.id)) {
            fetched.push({ id:d.id, ...d.data(), roomTitle:room.title, roomId:room.id });
          }
        });
        done++;
        if (done === allRooms.length) setBookmarkedPosts([...fetched]);
      });
    });
  }, [bookmarks, allRooms]);

  const totalPosts = allRooms.reduce((s,r) => s+(r.postCount||0), 0);
  const doneRooms  = allRooms.filter(r => r.status==="done");
  const activeRooms= allRooms.filter(r => r.status!=="done");

  return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans, paddingBottom:20 }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />

      {/* 헤더 */}
      <div style={{ padding:"calc(env(safe-area-inset-top,0px) + 1.25rem) 1.5rem 1rem", display:"flex", alignItems:"center", gap:12 }}>
        <Avatar user={user} size={42} />
        <div>
          <div style={{ fontSize:"1rem", fontWeight:700, color:T.black }}>{user.displayName}</div>
          <div style={{ fontSize:"0.78rem", color:T.gray3, marginTop:1 }}>교환독서 멤버</div>
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{ display:"flex", gap:10, padding:"0 1.5rem 1.25rem" }}>
        {[
          { label:"참여한 모임", value:allRooms.length },
          { label:"완독한 책",   value:doneRooms.length },
          { label:"내 포스트",   value:totalPosts },
          { label:"북마크",      value:bookmarks.length },
        ].map(s => (
          <div key={s.label} style={{ flex:1, background:T.white, borderRadius:12, padding:"12px 8px", textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:"1.3rem", fontWeight:700, color:T.black }}>{s.value}</div>
            <div style={{ fontSize:"0.68rem", color:T.gray3, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <Divider />

      {/* 탭 */}
      <div style={{ display:"flex", padding:"0.75rem 1.5rem", gap:8 }}>
        {[{id:"history",label:"독서 기록"},{id:"bookmarks",label:"북마크"}].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ flex:1, padding:"10px", borderRadius:10, border:"none", cursor:"pointer", fontSize:"0.9rem", fontWeight:600, fontFamily:T.fontSans, background:tab===t.id?T.black:T.surface, color:tab===t.id?"#fff":T.gray2, transition:"all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 독서 기록 탭 */}
      {tab === "history" && (
        <div style={{ padding:"0 1.5rem" }}>
          {activeRooms.length > 0 && (
            <>
              <div style={{ fontSize:"0.78rem", fontWeight:600, color:T.gray2, margin:"0.75rem 0 0.6rem", letterSpacing:"0.04em" }}>진행중</div>
              {activeRooms.map(room => <RoomHistoryCard key={room.id} room={room} />)}
            </>
          )}
          {doneRooms.length > 0 && (
            <>
              <div style={{ fontSize:"0.78rem", fontWeight:600, color:T.gray2, margin:"1.25rem 0 0.6rem", letterSpacing:"0.04em" }}>완독</div>
              {doneRooms.map(room => <RoomHistoryCard key={room.id} room={room} done />)}
            </>
          )}
          {allRooms.length === 0 && (
            <div style={{ textAlign:"center", padding:"3rem 0", color:T.gray3 }}>
              <div style={{ fontSize:"2rem", marginBottom:"0.75rem" }}>📚</div>
              <div style={{ fontSize:"0.9rem" }}>아직 참여한 모임이 없어요</div>
            </div>
          )}
        </div>
      )}

      {/* 북마크 탭 */}
      {tab === "bookmarks" && (
        <div style={{ padding:"0.5rem 1.5rem" }}>
          {bookmarkedPosts.length === 0 ? (
            <div style={{ textAlign:"center", padding:"3rem 0", color:T.gray3 }}>
              <div style={{ fontSize:"2rem", marginBottom:"0.75rem" }}>🔖</div>
              <div style={{ fontSize:"0.9rem" }}>북마크한 포스트가 없어요</div>
              <div style={{ fontSize:"0.8rem", color:T.gray4, marginTop:4 }}>포스트의 🔖 버튼을 눌러 저장하세요</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.875rem", marginTop:"0.5rem" }}>
              {bookmarkedPosts.map(post => (
                <div key={post.id} style={{ background:T.white, borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ height:3, background:getColor(post.colorId).color }} />
                  {post.type === "text" ? (
                    <div style={{ padding:"1rem 1.1rem", background:T.surface }}>
                      <p style={{ fontSize:"0.95rem", color:T.gray1, lineHeight:1.8, margin:0, fontStyle:"italic" }}>"{post.quote}"</p>
                    </div>
                  ) : post.imageDataUrl ? (
                    <img src={post.imageDataUrl} alt="" style={{ width:"100%", maxHeight:200, objectFit:"contain", background:T.surface, display:"block" }} />
                  ) : null}
                  <div style={{ padding:"0.85rem 1.1rem" }}>
                    <div style={{ fontSize:"0.72rem", color:T.gray3, marginBottom:4 }}>📖 {post.roomTitle}</div>
                    <div style={{ fontSize:"0.82rem", fontWeight:600, color:T.black, marginBottom:2 }}>{post.authorName}</div>
                    <p style={{ fontSize:"0.88rem", color:T.gray2, margin:0, lineHeight:1.6 }}>{post.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 모임 기록 카드 (서재용) ───────────────────────────────────────────────────
function RoomHistoryCard({ room, done }) {
  return (
    <div style={{ background:T.white, borderRadius:14, padding:"1rem 1.1rem", marginBottom:10, display:"flex", gap:12, alignItems:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", opacity:done?0.75:1 }}>
      <div style={{ width:40, height:54, background:done?T.gray3:T.black, borderRadius:"3px 5px 5px 3px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem", flexShrink:0, boxShadow:"inset -2px 0 4px rgba(0,0,0,0.15)" }}>
        {done?"📘":"📗"}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:"0.95rem", fontWeight:600, color:T.black, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{room.title}</div>
        {room.author && <div style={{ fontSize:"0.78rem", color:T.gray2, marginTop:1 }}>{room.author}</div>}
        <div style={{ display:"flex", gap:8, marginTop:4, fontSize:"0.72rem", color:T.gray3 }}>
          <span>멤버 {room.memberUids?.length||1}명</span>
          <span>·</span>
          <span>포스트 {room.postCount||0}개</span>
          {room.dueDate && <><span>·</span><span>{new Date(room.dueDate).toLocaleDateString("ko-KR",{month:"short",day:"numeric"})} 완독</span></>}
        </div>
      </div>
      {done && <span style={{ fontSize:"0.72rem", background:T.surface, color:T.gray2, padding:"3px 8px", borderRadius:10, flexShrink:0 }}>완독 ✓</span>}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [mainTab, setMainTab]         = useState("rooms"); // rooms | library

  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
  }, []);

  // 북마크 상태 유저 객체에 동기화
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db,"users",user.uid), snap => {
      user._bookmarks = snap.data()?.bookmarks || [];
    });
    return unsub;
  }, [user]);

  if (loading) return (
    <div style={{ minHeight:"100dvh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", color:T.gray2, fontFamily:T.fontSans, fontSize:"0.95rem" }}>
      <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      불러오는 중…
    </div>
  );

  if (!user) return <LoginScreen />;
  if (currentRoom) return <RoomFeed room={currentRoom} user={user} onBack={()=>setCurrentRoom(null)} />;

  return (
    <div style={{ minHeight:"100dvh", background:T.bg, fontFamily:T.fontSans }}>
      {/* 탭 콘텐츠 */}
      {mainTab === "rooms"
        ? <RoomList user={user} onEnter={setCurrentRoom} />
        : <MyLibrary user={user} />
      }

      {/* 하단 탭바 */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:T.white, borderTop:`1px solid ${T.gray5}`, display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)", zIndex:200 }}>
        {[
          { id:"rooms",   icon:"📚", label:"모임" },
          { id:"library", icon:"🔖", label:"내 서재" },
        ].map(tab => (
          <button key={tab.id} onClick={()=>setMainTab(tab.id)}
            style={{ flex:1, padding:"12px 0 10px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3,
              color: mainTab===tab.id ? T.black : T.gray3, fontFamily:T.fontSans }}>
            <span style={{ fontSize:"1.3rem" }}>{tab.icon}</span>
            <span style={{ fontSize:"0.65rem", fontWeight: mainTab===tab.id ? 700 : 400 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      <div style={{ height:"calc(60px + env(safe-area-inset-bottom,0px))" }} />
      <style>{`*{-webkit-tap-highlight-color:transparent;}input,textarea,button{-webkit-appearance:none;}`}</style>
    </div>
  );
}