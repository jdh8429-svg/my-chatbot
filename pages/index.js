import { useState, useRef, useEffect } from "react";
import mammoth from "mammoth";

const ADMIN_PASSWORD = "admin1234"; // ← 원하는 비밀번호로 변경

async function extractText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt") return await file.text();
  if (ext === "pdf") {
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (!window.pdfjsLib) {
            await new Promise(r => {
              const s = document.createElement("script");
              s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
              s.onload = r; document.head.appendChild(s);
            });
          }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(x => x.str).join(" ") + "\n";
          }
          resolve(text);
        } catch { resolve("[PDF 추출 실패]"); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  if (ext === "docx") {
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const r = await mammoth.extractRawText({ arrayBuffer: e.target.result });
          resolve(r.value);
        } catch { resolve("[DOCX 추출 실패]"); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  return "[지원하지 않는 형식]";
}

function FileIcon({ ext }) {
  const map = { pdf: ["#ef4444","PDF"], txt: ["#6366f1","TXT"], docx: ["#3b82f6","DOC"] };
  const [color, label] = map[ext?.toLowerCase()] || ["#8b5cf6","FILE"];
  return (
    <div style={{ width:32,height:38,background:color,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
      <span style={{ color:"#fff",fontSize:8,fontWeight:700 }}>{label}</span>
    </div>
  );
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [files, setFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, loading]);

  const tryLogin = () => {
    if (pwInput === ADMIN_PASSWORD) {
      setIsAdmin(true); setShowPwModal(false); setPwInput(""); setPwError(false);
    } else { setPwError(true); }
  };

  const handleFiles = async (newFiles) => {
    setExtracting(true);
    const processed = await Promise.all(Array.from(newFiles).map(async f => {
      const ext = f.name.split(".").pop().toLowerCase();
      if (!["pdf","txt","docx"].includes(ext)) return null;
      const text = await extractText(f);
      return { name:f.name, ext, text, size:f.size };
    }));
    const valid = processed.filter(Boolean);
    setFiles(prev => {
      const names = new Set(prev.map(f=>f.name));
      return [...prev, ...valid.filter(f=>!names.has(f.name))];
    });
    setExtracting(false);
  };

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || loading) return;
    if (files.length === 0) {
      setMessages(prev => [...prev, { role:"assistant", content:"등록된 파일이 없습니다. 관리자에게 문의해주세요." }]);
      return;
    }
    const newMessages = [...messages, { role:"user", content:q }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    const context = files.map(f=>`=== ${f.name} ===\n${f.text.slice(0,8000)}`).join("\n\n");
    try {
      // 백엔드 API 라우트 호출 (API 키 안전하게 보호됨)
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages.map(m=>({ role:m.role, content:m.content })), context }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role:"assistant", content: data.reply }]);
    } catch(err) {
      setMessages(prev => [...prev, { role:"assistant", content:"오류: "+err.message }]);
    }
    setLoading(false);
  };

  const fmt = b => b<1024?b+"B":b<1048576?(b/1024).toFixed(1)+"KB":(b/1048576).toFixed(1)+"MB";

  return (
    <div style={{ display:"flex",height:"100vh",fontFamily:"'Apple SD Gothic Neo',sans-serif",background:"#f8f9fb",color:"#1a1a2e" }}>
      {showPwModal && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }}>
          <div style={{ background:"#fff",borderRadius:16,padding:28,width:300,boxShadow:"0 8px 32px rgba(0,0,0,0.15)" }}>
            <h3 style={{ margin:"0 0 4px",fontSize:16,fontWeight:700 }}>🔐 관리자 로그인</h3>
            <p style={{ margin:"0 0 16px",fontSize:12,color:"#9ca3af" }}>비밀번호를 입력하세요</p>
            <input type="password" value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
              onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="비밀번호" autoFocus
              style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${pwError?"#ef4444":"#e5e7eb"}`,fontSize:14,outline:"none",boxSizing:"border-box" }} />
            {pwError && <p style={{ color:"#ef4444",fontSize:12,margin:"6px 0 0" }}>비밀번호가 틀렸습니다</p>}
            <div style={{ display:"flex",gap:8,marginTop:16 }}>
              <button onClick={()=>{setShowPwModal(false);setPwInput("");setPwError(false);}} style={{ flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:13 }}>취소</button>
              <button onClick={tryLogin} style={{ flex:1,padding:"9px 0",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600 }}>로그인</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ width:270,background:"#fff",borderRight:"1px solid #eaecf0",display:"flex",flexDirection:"column",padding:"20px 14px",gap:14 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontSize:16,fontWeight:700,margin:0,color:"#111827" }}>📄 파일 챗봇</h1>
            <p style={{ fontSize:11,color:"#9ca3af",margin:"3px 0 0" }}>문서 기반 AI 답변</p>
          </div>
          {isAdmin
            ? <button onClick={()=>setIsAdmin(false)} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #fecaca",background:"#fef2f2",color:"#ef4444",cursor:"pointer" }}>로그아웃</button>
            : <button onClick={()=>setShowPwModal(true)} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #e0e7ff",background:"#eef2ff",color:"#6366f1",cursor:"pointer" }}>관리자</button>}
        </div>

        {isAdmin && (
          <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFiles(e.dataTransfer.files);}}
            onClick={()=>fileInputRef.current?.click()}
            style={{ border:`2px dashed ${dragging?"#6366f1":"#e5e7eb"}`,borderRadius:10,padding:"16px 10px",textAlign:"center",cursor:"pointer",background:dragging?"#eef2ff":"#fafafa" }}>
            <div style={{ fontSize:20,marginBottom:4 }}>📎</div>
            <p style={{ fontSize:11,color:"#6b7280",margin:0 }}>{extracting?"분석 중...":"클릭 또는 드래그\nPDF · TXT · DOCX"}</p>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.docx" style={{ display:"none" }} onChange={e=>handleFiles(e.target.files)} />
          </div>
        )}

        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span style={{ fontSize:12,fontWeight:600,color:"#374151" }}>등록된 파일 {files.length>0?`(${files.length})`:""}</span>
          {isAdmin && files.length>0 && <button onClick={()=>setFiles([])} style={{ fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer" }}>전체 삭제</button>}
        </div>

        <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:6 }}>
          {files.length===0
            ? <p style={{ fontSize:12,color:"#d1d5db",textAlign:"center",marginTop:8 }}>등록된 파일 없음</p>
            : files.map(f=>(
              <div key={f.name} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#f9fafb",borderRadius:8,border:"1px solid #f3f4f6" }}>
                <FileIcon ext={f.ext} />
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ margin:0,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#374151" }}>{f.name}</p>
                  <p style={{ margin:0,fontSize:10,color:"#9ca3af" }}>{fmt(f.size)}</p>
                </div>
                {isAdmin && <button onClick={()=>setFiles(p=>p.filter(x=>x.name!==f.name))} style={{ background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:15 }}>×</button>}
              </div>
            ))}
        </div>
      </div>

      <div style={{ flex:1,display:"flex",flexDirection:"column" }}>
        <div style={{ flex:1,overflowY:"auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:14 }}>
          {messages.length===0 && (
            <div style={{ margin:"auto",textAlign:"center",color:"#9ca3af" }}>
              <div style={{ fontSize:44,marginBottom:10 }}>💬</div>
              <p style={{ fontSize:15,fontWeight:600,color:"#6b7280",margin:0 }}>궁금한 점을 질문해보세요</p>
              <p style={{ fontSize:12,color:"#d1d5db",marginTop:5 }}>등록된 문서 내용을 기반으로 답변합니다</p>
            </div>
          )}
          {messages.map((m,i)=>(
            <div key={i} style={{ display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
              {m.role==="assistant" && (
                <div style={{ width:28,height:28,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,marginRight:7,flexShrink:0,marginTop:2 }}>🤖</div>
              )}
              <div style={{ maxWidth:"72%",padding:"10px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?"#6366f1":"#fff",color:m.role==="user"?"#fff":"#1f2937",fontSize:14,lineHeight:1.65,boxShadow:"0 1px 3px rgba(0,0,0,0.07)",whiteSpace:"pre-wrap",wordBreak:"break-word" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>🤖</div>
              <div style={{ background:"#fff",borderRadius:"16px 16px 16px 4px",padding:"12px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.07)",display:"flex",gap:4 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"#6366f1",animation:"bounce 1.2s infinite",animationDelay:`${i*0.2}s`,opacity:0.7 }}/>)}
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>

        <div style={{ padding:"14px 20px",background:"#fff",borderTop:"1px solid #eaecf0" }}>
          <div style={{ display:"flex",gap:8,alignItems:"flex-end",background:"#f9fafb",borderRadius:12,border:"1.5px solid #e5e7eb",padding:"7px 7px 7px 14px" }}>
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
              placeholder="질문을 입력하세요... (Enter 전송)" rows={1}
              style={{ flex:1,border:"none",outline:"none",background:"transparent",fontSize:14,resize:"none",maxHeight:100,lineHeight:1.6,color:"#1f2937",fontFamily:"inherit" }}
              onInput={e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }} />
            <button onClick={sendMessage} disabled={loading||!input.trim()}
              style={{ width:34,height:34,borderRadius:8,border:"none",cursor:loading||!input.trim()?"not-allowed":"pointer",background:loading||!input.trim()?"#e5e7eb":"#6366f1",color:"#fff",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>↑</button>
          </div>
          <p style={{ fontSize:11,color:"#d1d5db",textAlign:"center",margin:"6px 0 0" }}>등록된 문서 내용만을 기반으로 답변합니다</p>
        </div>
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}`}</style>
    </div>
  );
}
