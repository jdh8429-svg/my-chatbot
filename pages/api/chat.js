export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { messages, context } = req.body;

  const system = `너는 업로드된 문서를 기반으로 질문에 빠르고 정확하게 답하는 어시스턴트야. 문서 내용만 바탕으로 답하고, 없는 내용은 "문서에서 찾을 수 없습니다"라고 해. 한국어로 간결하게 답해.\n\n[문서]\n${context}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,  // .env.local에서 불러옴
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system,
        messages,
      }),
    });

    const data = await response.json();
    const reply = data.content?.map(b => b.text || "").join("") || "응답 오류";
    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ reply: "서버 오류: " + err.message });
  }
}