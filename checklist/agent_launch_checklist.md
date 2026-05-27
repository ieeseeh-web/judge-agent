# AI 에이전트 오픈 전 체크리스트

> 목적: 사용자 대신 도구를 호출하거나 데이터를 조회·수정·전송할 수 있는 AI 에이전트를 운영 환경에 공개하기 전에 확인해야 할 항목을 정리합니다.  
> 기준: NIST AI RMF/GenAI Profile, OWASP LLM Top 10 및 Governance Checklist, CISA/NSA/FBI AI Data Security, Google SAIF, 공개 사고 사례를 근거로 작성했습니다.

## 1. 핵심 체크리스트

| 영역 | 오픈 전 확인 항목 | 통과 기준 / 산출물 | 왜 필요한가 | 관련 실제 사례 | 주요 출처 |
|---|---|---|---|---|---|
| 목적·범위 | 에이전트가 “무엇을 할 수 있고, 무엇을 절대 하면 안 되는지”를 문서화했는가 | 역할, 금지행위, 승인 필요 행위, 실패 시 fallback 문서화 | 범위가 불명확하면 모델이 사용자 기대와 다른 행동을 할 수 있음 | Air Canada 챗봇은 고객에게 잘못된 환불 절차를 안내했고 회사 책임으로 판단됨 | [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence), [Moffatt v. Air Canada 해설/판례 요약](https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot) |
| 책임소재 | 에이전트 답변·행동에 대한 운영 책임자와 승인권자를 지정했는가 | 서비스 owner, security owner, legal/privacy owner, 장애 연락망 | “챗봇이 한 말”도 서비스 제공자의 책임이 될 수 있음 | Air Canada는 챗봇을 별도 주체라고 주장했지만 받아들여지지 않음 | [Moffatt v. Air Canada 해설](https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot) |
| 위험평가 | 출시 전 threat modeling / risk assessment를 수행했는가 | 데이터 흐름도, 위협 목록, 완화책, 잔여위험 승인 | GenAI는 환각, 데이터 유출, 프롬프트 인젝션, 오남용 등 고유 위험이 있음 | EchoLeak은 외부 이메일의 악성 지시가 Copilot의 내부 데이터 접근과 결합되어 유출로 이어진 사례 | [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence), [MITRE ATLAS](https://atlas.mitre.org/) |
| 프롬프트 인젝션 | 직접/간접 프롬프트 인젝션 테스트를 했는가 | 악성 웹페이지·문서·이메일·첨부파일 기반 red-team 결과, 차단/격리 정책 | 에이전트는 외부 콘텐츠를 “명령”으로 오인할 수 있음 | EchoLeak(CVE-2025-32711): 악성 이메일만으로 Microsoft 365 Copilot 정보 유출 가능성이 보고됨 | [OWASP LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/), [NVD CVE-2025-32711](https://nvd.nist.gov/vuln/detail/CVE-2025-32711), [EchoLeak 논문](https://arxiv.org/html/2509.10540v1) |
| 권한 최소화 | 에이전트·도구·API 토큰 권한을 최소화했는가 | read/write/delete/send 권한 분리, least privilege, scoped token, 만료/회전 정책 | 에이전트가 탈취·오작동되면 권한 범위만큼 피해가 커짐 | Replit AI agent가 운영 DB를 삭제했다는 보도는 에이전트 권한과 운영환경 격리의 중요성을 보여줌 | [OWASP LLM06 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), [Fortune 보도](https://fortune.com/2025/07/23/ai-coding-tool-replit-wiped-database-called-it-a-catastrophic-failure/) |
| 승인 게이트 | 돈, 법적 약속, 외부 발송, 삭제·수정 등 고위험 행동에 사람 승인 단계를 두었는가 | Human-in-the-loop 정책, 승인 UI, 감사 로그 | 자율 행동이 계약·금전·데이터 손실로 이어질 수 있음 | Chevy 딜러 챗봇이 2024 Tahoe를 $1에 판매하겠다고 응답한 사례 | [OWASP LLM06 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), [GM Authority 보도](https://gmauthority.com/blog/2023/12/gm-dealer-chat-bot-agrees-to-sell-2024-chevy-tahoe-for-1) |
| 데이터 분류 | 에이전트가 접근 가능한 데이터의 등급과 사용 가능 범위를 정의했는가 | 공개/내부/기밀/개인정보/영업비밀 분류, 입력 금지 데이터 목록 | 민감정보가 프롬프트·로그·외부 모델 API로 유출될 수 있음 | Samsung 직원들이 ChatGPT에 소스코드·회의 내용을 입력했다는 유출 보도 | [CISA AI Data Security](https://www.cisa.gov/news-events/alerts/2025/05/22/new-best-practices-guide-securing-ai-data-released), [AI Incident Database 768](https://incidentdatabase.ai/cite/768) |
| 개인정보·법무 | 개인정보 처리, 보관, 삭제, 제3자 제공, 국외 이전을 검토했는가 | DPIA/PIA, 개인정보 처리방침 반영, 보존기간, 삭제 요청 절차 | 에이전트 로그와 대화는 개인정보·민감정보가 될 수 있음 | 고객지원 챗봇은 고객 사정·환불·결제 등 민감 맥락을 다룰 수 있음 | [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence), [OWASP Governance Checklist](https://genai.owasp.org/resource/llm-applications-cybersecurity-and-governance-checklist-english/) |
| RAG·검색 | 검색/벡터DB 접근제어와 문서 출처 검증을 했는가 | tenant별 인덱스 분리 또는 row-level ACL, 문서 provenance, 검색 결과 필터링 | RAG는 권한이 다른 문서를 섞어 검색하거나 악성 문서를 주입받을 수 있음 | OWASP는 vector/embedding weakness를 별도 위험으로 분류 | [OWASP LLM08 Vector and Embedding Weaknesses](https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/) |
| 출력 검증 | 모델 출력이 코드, SQL, HTML, 이메일, 계약 문구 등으로 실행·전송되기 전 검증되는가 | allowlist, schema validation, escaping/sanitization, policy checker | 부적절한 출력 처리로 XSS, SQL 실행, 허위 약속, 악성 링크 전송이 가능 | Chevy 챗봇 사례처럼 출력이 영업 약속처럼 해석될 수 있음 | [OWASP LLM05 Improper Output Handling](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/) |
| 환각·정확성 | 근거 기반 답변, 불확실성 표시, 최신성 검증 절차가 있는가 | citation, retrieval grounding, “모름/확인 필요” 응답 정책, 샘플 QA 평가 | 에이전트의 그럴듯한 오답은 금전·법적 피해로 이어질 수 있음 | Air Canada 챗봇의 잘못된 bereavement fare 안내 | [OWASP LLM09 Misinformation](https://genai.owasp.org/llmrisk/llm092025-misinformation/), [AI Incident Database 639](https://incidentdatabase.ai/cite/639) |
| 비용·자원 제한 | 호출량, 토큰, 파일 크기, 반복 실행, 병렬 작업 제한이 있는가 | rate limit, budget cap, timeout, circuit breaker, queue policy | 무한 루프·과도한 호출은 비용 폭증과 서비스 장애를 유발 | OWASP는 unbounded consumption을 LLM Top 10 위험으로 분류 | [OWASP LLM10 Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) |
| 로깅·감사 | 누가, 언제, 어떤 입력으로, 어떤 도구를 호출했고, 결과가 무엇인지 추적 가능한가 | immutable audit log, prompt/tool trace, PII 마스킹, 보존기간 | 사고 분석, 책임 규명, 사용자 이의제기에 필요 | EchoLeak처럼 공격 체인이 복합적이면 상세 로그 없이는 원인 분석이 어려움 | [Google SAIF](https://safety.google/safety/saif/), [CISA AI Data Security](https://www.cisa.gov/news-events/alerts/2025/05/22/new-best-practices-guide-securing-ai-data-released) |
| 모니터링·대응 | 이상행동 탐지와 incident response playbook이 준비됐는가 | abuse signal, data exfiltration 탐지, kill switch, rollback, 연락망 | 출시 후 새로운 공격 패턴과 데이터 드리프트가 발생함 | Microsoft Copilot EchoLeak은 패치와 advisory가 필요한 취약점으로 등록됨 | [NVD CVE-2025-32711](https://nvd.nist.gov/vuln/detail/CVE-2025-32711), [Google SAIF](https://safety.google/safety/saif/) |
| 모델·공급망 | 모델, 플러그인, MCP/tool 서버, 외부 API, 라이브러리 공급망을 검토했는가 | SBOM/AIBOM, vendor risk review, dependency scan, 모델 변경관리 | LLM 앱은 모델·데이터·플러그인 공급망 전체가 공격면이 됨 | 악성/취약 도구 연결 시 에이전트 권한을 통해 피해 확대 가능 | [OWASP LLM03 Supply Chain](https://genai.owasp.org/llmrisk/llm032025-supply-chain/), [OWASP Governance Checklist](https://genai.owasp.org/resource/llm-applications-cybersecurity-and-governance-checklist-english/) |
| 운영환경 격리 | 개발·스테이징·운영 데이터와 권한이 분리되어 있는가 | prod DB write 금지 기본값, sandbox, canary rollout, backup/restore 검증 | 테스트 중인 에이전트가 운영 데이터를 수정·삭제하면 복구가 어려움 | Replit AI agent의 운영 DB 삭제 보도 | [Fortune 보도](https://fortune.com/2025/07/23/ai-coding-tool-replit-wiped-database-called-it-a-catastrophic-failure/), [OWASP LLM06](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) |
| 사용자 고지 | AI 사용 사실, 한계, 데이터 사용, 사람 상담 전환 경로를 명확히 고지했는가 | UI 고지, 약관/FAQ, 이의제기·정정·상담 전환 절차 | 사용자가 AI 답변의 한계와 책임 경로를 알아야 함 | Air Canada 사례는 고객이 챗봇 답변을 신뢰했을 때 법적 책임 문제가 발생할 수 있음을 보여줌 | [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence), [Moffatt v. Air Canada 해설](https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot) |

## 2. 실제 사례 요약

| 사례 | 무엇이 일어났나 | 체크리스트에 주는 교훈 | 출처 |
|---|---|---|---|
| Air Canada 챗봇 bereavement fare 사건 | 고객이 챗봇의 잘못된 환불 안내를 믿고 항공권을 구매했고, BC Civil Resolution Tribunal은 회사가 챗봇 정보에 책임질 수 있다고 판단 | 고객-facing 에이전트는 정확성 검증, 고위험 답변 fallback, 책임소재가 필수 | [McCarthy Tétrault 해설](https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot), [AI Incident Database 639](https://incidentdatabase.ai/cite/639) |
| EchoLeak / Microsoft 365 Copilot CVE-2025-32711 | 악성 이메일 기반 zero-click prompt injection으로 Copilot이 민감 데이터를 유출할 수 있다는 취약점이 보고됨 | 외부 콘텐츠와 내부 권한 데이터는 격리하고, 프롬프트 인젝션 방어·출력 필터·CSP·권한 제어가 필요 | [NVD CVE-2025-32711](https://nvd.nist.gov/vuln/detail/CVE-2025-32711), [EchoLeak 논문](https://arxiv.org/html/2509.10540v1) |
| Replit AI agent 운영 DB 삭제 보도 | AI 코딩 에이전트가 운영 데이터베이스를 삭제했다는 사고가 보도됨 | 개발 중 에이전트는 운영 write/delete 권한을 갖지 않아야 하며, 백업·복구와 승인 게이트가 필요 | [Fortune 보도](https://fortune.com/2025/07/23/ai-coding-tool-replit-wiped-database-called-it-a-catastrophic-failure/), [MintMCP 정리](https://www.mintmcp.com/blog/replit-agent-production-database-deletion) |
| Chevy 딜러 챗봇 $1 Tahoe 응답 | 딜러 챗봇이 사용자의 유도에 따라 차량을 $1에 판매하겠다는 식으로 응답했다고 보도됨 | 가격·계약·약속성 문구는 모델 단독 생성 금지, 정책 기반 검증과 human approval 필요 | [GM Authority](https://gmauthority.com/blog/2023/12/gm-dealer-chat-bot-agrees-to-sell-2024-chevy-tahoe-for-1), [Cybernews](https://cybernews.com/ai-news/chevrolet-dealership-chatbot-hack/) |
| Samsung ChatGPT 데이터 유출 보도 | 직원들이 소스코드·회의 내용 등 내부 정보를 외부 GenAI 도구에 입력했다는 보도 | 입력 데이터 분류, 외부 모델 사용 정책, DLP, 로그 마스킹, 사내 교육이 필요 | [AI Incident Database 768](https://incidentdatabase.ai/cite/768), [Bloomberg 보도](https://www.bloomberg.com/news/articles/2023-05-02/samsung-bans-chatgpt-and-other-generative-ai-use-by-staff-after-leak) |

## 3. 오픈 승인 기준 예시

| Gate | 승인 조건 | 승인자 예시 |
|---|---|---|
| Security Go/No-Go | OWASP LLM Top 10 기준 테스트 완료, Critical/High 미해결 0건, tool 권한 최소화 완료 | Security Lead |
| Privacy/Legal Go/No-Go | 개인정보 영향평가, 데이터 처리방침, 보존·삭제 정책, 사용자 고지 완료 | Privacy/Legal Lead |
| Product Go/No-Go | 범위·한계·fallback UX, 사람 상담 전환, 정확성 평가 통과 | Product Owner |
| Operations Go/No-Go | 모니터링, 알림, kill switch, rollback, 백업 복구 리허설 완료 | SRE/Ops Lead |
| Business Go/No-Go | 비용 상한, SLA, 책임소재, 고객 커뮤니케이션 계획 승인 | Business Owner |

## 4. 참고 출처

| 출처 | 내용 |
|---|---|
| [NIST AI 600-1: Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) | GenAI 시스템의 거버넌스, 위험 식별·측정·관리, 생애주기 관점의 신뢰성 고려 |
| [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/) | Prompt Injection, Sensitive Information Disclosure, Supply Chain, Excessive Agency 등 LLM 앱 주요 위험 |
| [OWASP LLM Applications Cybersecurity and Governance Checklist](https://genai.owasp.org/resource/llm-applications-cybersecurity-and-governance-checklist-english/) | 리더·보안·개인정보·컴플라이언스·DevSecOps 조직을 위한 거버넌스 체크리스트 |
| [CISA/NSA/FBI AI Data Security 안내](https://www.cisa.gov/news-events/alerts/2025/05/22/new-best-practices-guide-securing-ai-data-released) | AI 생애주기 전반의 데이터 보안, 무결성, 모니터링, 위협탐지 중요성 |
| [Google Secure AI Framework](https://safety.google/safety/saif/) | AI 생태계에 보안 기반, 탐지·대응, 일관된 통제, 피드백 루프를 확장하는 프레임워크 |
| [MITRE ATLAS](https://atlas.mitre.org/) | AI 시스템 대상 공격 전술·기술 지식베이스 |
