# Pitchmic — Full Architectural Design

> **Platform**: AI-Native Venture Capital Intelligence & Founder-Investor Networking
> **Stack**: Django 5 · Next.js 16 · FastAPI ML Service · PostgreSQL · Redis · ChromaDB · Caddy

---

## 1. System Overview

Pitchmic is a two-sided marketplace connecting **startup founders** with **institutional investors**. The ML engine — Bayesian inference, survival analysis, graph ML, anomaly detection, calibration, behavioral scoring — is **always active** and owns every probability or score. LLMs are auxiliary, used only for claim extraction and narrative explanation; they never own a forecast. `ENABLE_AI_FEATURES` defaults to **`False`** (pure-ML mode).

```mermaid
flowchart TD
    Browser[" Browser\n(Next.js 16 App Router)"]
    Caddy["Caddy 2.8\nReverse Proxy + TLS"]
    NextBFF["Next.js BFF\n/api/auth/*"]
    Django["Django 5 REST Backend\n18 Domain Apps"]
    MLSvc["FastAPI ML Service\nXGBoost / Bayesian / Survival\nport 5000"]
    PG[(PostgreSQL 16)]
    Redis[(Redis 7\nCache · Channels · Broker)]
    Chroma[(ChromaDB 0.5\nVector Store / Digital Brain)]
    Celery["Celery Workers\nqueues: default + ml"]
    LLM["LLM Gateway\nOpenAI / Gemini / OpenRouter\ndefault: noop"]
    S3["S3 Storage\n(Decks · Docs · Media)"]
    WS["WebSocket\n(Django Channels)"]

    Browser --> Caddy
    Caddy --> NextBFF & Django & MLSvc
    Browser <-->|ws| WS
    NextBFF -->|cookie proxy| Django
    Django --> PG & Redis & Chroma & Celery & MLSvc & LLM & S3
    WS <-->|channel layer| Redis
    MLSvc --> Redis
    Celery --> PG & LLM
```

### 1.1 What is rare here

The framework is ordinary. These components are not, and each is checkable
against a named file and a named test rather than taken on description.

| Capability | Lives in | Verify with |
| :--- | :--- | :--- |
| Conjugate Bayesian belief updating — prior/posterior α,β per sector and stage, with credible intervals instead of point estimates | `backend/apps/intelligence/ml/bayesian.py` | `backend/Tests/test_institutional_intelligence.py` |
| Parametric Weibull survival curves for time-to-next-round, with hazard rate derived from runway burn (`k` shape shifts at a 12-month runway boundary) | `backend/apps/intelligence/ml/survival.py` | `backend/Tests/test_institutional_intelligence.py` |
| Pitch-deck forensics: unit-economics audit, score ledger, and explicit `math_consistency_checks` that fail a deck whose stated numbers do not reconcile | `backend/apps/intelligence/forensics.py` | `backend/Tests/test_enterprise_intelligence.py`, `backend/Tests/test_production_scale.py` |
| Multi-strategy opportunity ingestion with **per-field provenance** — `DeadlineEvidence` stores a value, its source URL, source tier, confidence and retrieval time for each date independently | `backend/apps/matching/opportunity_fetcher.py`, `backend/apps/intelligence_engine/models_opportunities.py` | No automated coverage — read `SourceFetcher.fetch` / `fetch_rss` / `parse_signals` and the `DeadlineEvidence` model |
| Tenant-scoped institutional memory (Digital Brain) over ChromaDB | `backend/apps/intelligence/digital_brain.py` | `backend/Tests/test_enterprise_intelligence.py`, `backend/apps/tests/test_security.py` |
| A single tenant-boundary module that answers "whose programs may this account see" separately from "is this account staff", and a row scoper that refuses a founder rather than falling back to a wider reach | `backend/apps/accelerator/tenant.py` | `backend/Tests/smoke_tenant_scope_bypass.py`, `backend/Tests/smoke_authorization_matrix.py`, `backend/Tests/smoke_application_tenant_scope.py` |
| A claim-verification vocabulary in which the states that mean "a human checked this" are unreachable by any machine path, and the ledger-to-engine mapping is deliberately one-directional so an import can never forge attribution | `backend/apps/accelerator/evidence_state.py` | `backend/Tests/smoke_claim_verification.py`, `backend/Tests/smoke_document_upload_honesty.py` |
| An evidence-extraction **port that raises** when nothing stands behind it, instead of returning an empty list — so "no extractor is wired" is never readable as "the document contained no claims" | `backend/apps/accelerator/evidence_extraction.py` | `backend/Tests/smoke_document_upload_honesty.py` |

The last row is the design rule the rest of the accelerator layer follows: an
absent capability announces itself. Nothing in this repository returns `[]` to
mean "not implemented".

---

## 2. Backend Configuration

| Component | Technology | Notes |
| :--- | :--- | :--- |
| Reverse Proxy | **Caddy 2.8** | Automatic TLS (replaces Nginx) |
| Web Server | **Django 5 + Uvicorn ASGI** | HTTP REST + WebSocket |
| Task Queue | **Celery 5 + django-celery-beat** | Queues: `default`, `ml` |
| Scheduler | **DatabaseScheduler** | Beat schedules in PostgreSQL |
| Broker | **Redis 7** | DB0 Cache+Sessions · DB1 Broker · DB2 Results |
| Vector Store | **ChromaDB 0.5.23** | Digital Brain RAG; `CHROMA_AUTH_TOKEN` |
| Auth | **djangorestframework-simplejwt** | Access **30 min** · Refresh 7 day · Argon2 |
| CORS | **django-cors-headers** | `CORS_ALLOW_ALL_ORIGINS=True` in DEBUG only |
| API Schema | **drf-spectacular** | OpenAPI 3 · Swagger · ReDoc |
| LLM | **OpenAI / Gemini / OpenRouter / noop** | `ENABLE_AI_FEATURES=False` default |

### ML-First Capability Tiers

| Tier | Meaning |
| :--- | :--- |
| `ml_only` | Always on — deterministic, no LLM |
| `ai_opt` | LLM when available; heuristic fallback always present |
| `ai_req` | Disabled when `ENABLE_AI_FEATURES=False` |

Runtime matrix: `GET /api/v1/predictive/features/capabilities/`

---

## 3. Domain Application Map

```mermaid
flowchart LR
    subgraph BACKEND["Django Backend — apps/"]
        users["users\nCustom User · StartupProfile\nInvestorProfile · TeamMember"]
        pitches["pitches\nPitch · PitchAttachment · PitchLike"]
        matching["matching\nMatchScore · 5-dim cosine algorithm"]
        offers["offers\nOffer · WebSocket bid consumer"]
        dataroom["dataroom\nDocument · Folder · DocumentVersion\nAuditLog · 5-tier classification\nSlide heatmap telemetry"]
        newsfeed["newsfeed\nActivity feed"]
        notifications["notifications\nIn-App · Email"]
        marketing["marketing\nOutreachCampaign · OutreachMessage"]
        analytics["analytics\nFundraisingPrediction\nStartupScoringEngine 5-dim"]
        intelligence["intelligence\n11+ models · 4-stage DD pipeline\nHybridRAG · Digital Brain · Voice\nKnowledge Graph · RBAC\nMetering · Licensing · Cohorts"]
        accelerator["accelerator\n82 models · Venture Admissions\nSelection lifecycle · Review integrity\nProgram Configuration CMS · Intake\nSee §21"]
        predictive["predictive_intelligence\nFeature Store · Venture Outcomes\nSurvival · Bayesian Logs\nInvestor Intent · Graph ML\nAnomaly · Calibration · MLOps"]
    end
```

---

## 4. Intelligence App — Model Taxonomy

```mermaid
erDiagram
    PitchDeckForensicAnalysis {
        int id
        fk startup
        float fundability_score
        json unit_economics_audit
        json competitor_benchmarks
        json score_ledger
        json dimension_scores
        text bull_thesis
        text bear_thesis
    }
    DueDiligenceReport {
        int id
        fk startup
        string status
        string verdict
        json debate_transcript
        json scorecard
        text final_memo
    }
    StealthFounderSignal {
        int id
        string founder_name
        string signal_type
        float confidence
        string jurisdiction
    }
    InstitutionalMemoryEntry {
        int id
        string company_name
        string source_type
        text content
        vector embedding
        string verdict
    }
    VoiceInterviewSession {
        int id
        fk startup
        string stage
        string persona
        json transcript
        json debrief_scorecard
    }
    EnterpriseTenant {
        int id
        string name
        string tier
        int monthly_deal_quota
    }
    TenantAPIKey {
        int id
        fk tenant
        string key_prefix
        string key_hash_sha256
    }
    Cohort {
        int id
        string name
        string program_type
        date application_deadline
    }
    ICMemoVote {
        int id
        fk report
        fk voter
        string verdict
        text rationale
    }
```

---

## 5. Full API Endpoint Contract

> The **accelerator** API (`/api/v1/accelerator/` — 56 viewsets plus `context/`, `work-inbox/`,
> `evidence-graph/`, `intake/*`, `program-studio/seed/`) is documented with the subsystem itself in
> **§21**, because its routes are only meaningful next to the selection rules they enforce.
> `GET /api/v1/schema/` (drf-spectacular) lists every operation.

### 5.1 Core Domain

| App | Route | Method | Purpose |
| :--- | :--- | :--- | :--- |
| **auth** | `/api/v1/users/auth/login/` | POST | JWT Login |
| | `/api/v1/users/auth/register/` | POST | Register |
| | `/api/v1/users/auth/refresh/` | POST | Rotate Token |
| | `/api/v1/users/auth/verify-email/` | POST | TimestampSigner (24 h) |
| | `/api/v1/users/auth/resend-verification/` | POST | Resend (202 anti-enum) |
| | `/api/v1/users/profile/me/` | GET/PATCH | Profile |
| | `/api/v1/me/startup-profile/` | GET/PATCH | Startup + inline logo |
| | `/api/v1/me/investor-profile/` | GET/PATCH | Investor profile |
| | `/api/v1/upload/avatar/` | POST | Avatar (5 MB JPEG/PNG/WebP/GIF) |
| | `/api/v1/upload/logo/` | POST | Startup logo |
| | `/api/v1/upload/pitch-cover/` | POST | Pitch cover image |
| | `/api/v1/admin/summary/` | GET | Live DB telemetry (staff only) |
| **pitches** | `/api/v1/pitches/` | GET/POST | List & Create |
| | `/api/v1/pitches/<id>/` | GET/PUT/DELETE | CRUD |
| **matching** | `/api/v1/matching/top/` | GET | Top Matches |
| | `/api/v1/matching/refresh/` | POST | Recalculate |
| **offers** | `/api/v1/offers/` | GET/POST | Offers |
| **dataroom** | `/api/v1/dataroom/` | GET/POST | Document Upload |
| | `/api/v1/dataroom/<id>/grant/` | POST | NDA + Access |
| | `/api/v1/dataroom/access/<pk>/` | PATCH | Update permissions |
| | `/api/v1/dataroom/my-access/` | GET | Investor's grants |
| | `/api/v1/dataroom/telemetry/` | POST | Slide engagement |
| | `/api/v1/dataroom/telemetry/<doc_id>/` | GET | Heatmap + drop-off |
| **analytics** | `/api/v1/analytics/predict/` | POST | Fundraising Score |
| | `/api/v1/analytics/behavior/` | POST | Heatmap Telemetry |

### 5.2 Intelligence Endpoints (30 routes)

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/v1/intelligence/forensics/deck/upload/` | POST | Stage-aware deck underwriting |
| `/api/v1/intelligence/forensics/deck/` | POST | Text-based forensic analysis |
| `/api/v1/intelligence/startup/<pk>/` | GET | Startup intelligence |
| `/api/v1/intelligence/due-diligence/` | POST | Kick off 4-stage DD pipeline |
| `/api/v1/intelligence/due-diligence/<id>/` | GET | Retrieve DD report |
| `/api/v1/intelligence/due-diligence/<id>/debate/` | POST | Bull vs Bear debate |
| `/api/v1/intelligence/due-diligence/<id>/export/` | GET | LP-ready IC memo export |
| `/api/v1/intelligence/due-diligence/<id>/vote/` | POST | Partner consensus voting |
| `/api/v1/intelligence/predict/outcomes/` | POST | Multi-task unicorn probability |
| `/api/v1/intelligence/evidence/audit/` | POST | Immutable score ledger |
| `/api/v1/intelligence/graph/query/` | POST | Knowledge graph traversal |
| `/api/v1/intelligence/brain/query/` | POST | RAG Digital Brain query |
| `/api/v1/intelligence/brain/ingest/` | POST | Ingest memo/thesis |
| `/api/v1/intelligence/stealth/signals/` | GET | Browse stealth signals |
| `/api/v1/intelligence/stealth/discover/` | POST | Multi-registry sweep |
| `/api/v1/intelligence/voice/start/` | POST | Start voice session |
| `/api/v1/intelligence/voice/<id>/turn/` | POST | Submit transcript turn |
| `/api/v1/intelligence/voice/<id>/debrief/` | POST | Partner debrief scorecard |
| `/api/v1/intelligence/tenants/` | GET/POST | Enterprise tenants |
| `/api/v1/intelligence/tenants/<id>/keys/` | POST | Provision B2B API key |
| `/api/v1/intelligence/external/triage/` | POST | Partner triage + async webhook |
| `/api/v1/intelligence/antler/webhook/` | POST | Antler Hub sync |
| `/api/v1/intelligence/cohorts/` | GET/POST | Accelerator cohorts |
| `/api/v1/intelligence/cohorts/batch-upload/` | POST | Bulk upload (8-pillar scoring) |
| `/api/v1/intelligence/cohorts/<id>/leaderboard/` | GET | Ranked applications |
| `/api/v1/intelligence/cohorts/<id>/apply/` | POST | Startup applies |
| `/api/v1/intelligence/funding-events/` | GET/POST | Demo days · pitch nights |
| `/api/v1/intelligence/feedback/` | POST | Prediction feedback |
| `/api/v1/intelligence/models/` | GET | Model performance (staff) |

### 5.3 Predictive Intelligence Endpoints (25 routes)

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/v1/predictive/features/<id>/list/` | GET | Feature snapshots |
| `/api/v1/predictive/features/<id>/capture/` | POST | Capture snapshot |
| `/api/v1/predictive/features/snapshot/<pk>/` | GET | Snapshot detail |
| `/api/v1/predictive/features/capabilities/` | GET | ML vs AI matrix |
| `/api/v1/predictive/outcomes/startup/<pk>/latest/` | GET | Latest prediction |
| `/api/v1/predictive/outcomes/startup/<pk>/generate/` | POST | Generate prediction |
| `/api/v1/predictive/outcomes/<pk>/` | GET | Detail + survival + Bayesian |
| `/api/v1/predictive/outcomes/<pk>/feedback/` | POST | V2 feedback |
| `/api/v1/predictive/time-machine/<id>/list/` | GET | Historical snapshots |
| `/api/v1/predictive/time-machine/<id>/build/` | POST | Build historical snapshot |
| `/api/v1/predictive/time-machine/evaluate/` | POST | Backtest evaluation |
| `/api/v1/predictive/intent/startup/<id>/` | GET | Top investors by P(invest) |
| `/api/v1/predictive/intent/investor/<id>/score/` | POST | Score investor sequence |
| `/api/v1/predictive/graph/entities/` | GET/POST | Graph entity CRUD |
| `/api/v1/predictive/graph/entity/` | POST | Create entity |
| `/api/v1/predictive/graph/relation/` | POST | Create relation |
| `/api/v1/predictive/graph/traverse/` | POST | Multi-mode traversal |
| `/api/v1/predictive/anomalies/` | GET | Unresolved anomalies |
| `/api/v1/predictive/anomalies/audit/` | POST | Audit metrics batch |
| `/api/v1/predictive/anomalies/<pk>/resolve/` | POST | Analyst resolve |
| `/api/v1/predictive/registry/` | GET/POST | Model family registry |
| `/api/v1/predictive/registry/<pk>/versions/` | GET | Model versions |
| `/api/v1/predictive/evaluations/` | GET | Backtest runs |
| `/api/v1/predictive/experiments/` | GET | A/B experiments |
| `/api/v1/predictive/calibration/<version_id>/` | GET | Calibration records |

---

## 6. Frontend — Next.js 16 App Router

### 6.1 Route Structure

```
src/app/
├── layout.tsx · page.tsx · not-found.tsx · providers.tsx
├── (auth)/                    MarketingShell
│   ├── sign-in/
│   ├── sign-up/[role]/
│   └── verify/[token]/
├── (dashboard)/               Protected — Sidebar + Navbar
│   ├── layout.tsx
│   ├── newsfeed/  discover/   pitches/  pitches/new/
│   ├── pitches/[id]/  pitches/[id]/edit/   offers/
│   ├── messages/  dataroom/   campaigns/   notifications/
│   ├── analytics/ intelligence/ fundability/
│   ├── accelerator/           Venture Admissions dashboard — see §21
│   ├── pipeline/  investors/  application-intelligence/
│   ├── admin/     settings/   upgrade/     company/
│   └── profile/edit · avatar · logo
└── api/auth/  login · logout · refresh · register · verify · me
```

### 6.2 Key Modules

| Module | Purpose |
| :--- | :--- |
| `src/lib/api.ts` | Axios client — attaches JWT, handles 401 refresh |
| `src/lib/intelligenceApi.ts` | Typed intelligence + predictive endpoints |
| `src/lib/acceleratorApi.ts` | Accelerator contract: 80+ typed methods over `/api/v1/accelerator/` (§21) |
| `src/lib/screening.ts` | Shared readout helpers — query keys, `formatDateTime`, `relativeTime`, API error text |
| `src/lib/validators.ts` | Zod schemas (SignIn, SignUp, Pitch) |
| `src/lib/types.ts` | Shared TypeScript types |
| `src/hooks/useAuth.tsx` | Auth context: login, logout, refresh |
| `src/hooks/useNewsfeed.ts` | Paginated feed + infinite scroll |
| `src/hooks/useNotifications.ts` | Real-time notification subscription |
| `src/hooks/useInfiniteScroll.ts` | IntersectionObserver hook |

### 6.3 Component Library

```
ui/       Button · Card · Badge · Input · Label · Separator
          Sheet · DropdownMenu · Logo · Avatar · Textarea · Tooltip
layout/   Sidebar · Navbar · DashboardShell · MarketingShell · Footer
analytics/ SuccessPredictorDashboard · InvestorROIDashboard · InvestmentHeatmap
pitches/  LikeButton
newsfeed/ PitchCard
offers/   OfferRow · BidPanel
```

---

## 7. ML Service — Standalone FastAPI Microservice

Runs as a **separate Docker container** on **port 5000** (`ml-service:5000`).

```
ml/
├── main.py                   FastAPI entry-point
├── predictor.py              Core 30-feature orchestrator
├── api/app.py                App factory (rate limiter + metrics middleware)
├── config/settings.py        Pydantic-settings (env-var driven)
├── models/registry.py        Versioned model registry (atomic JSON)
├── models/trainer.py         XGBoost training pipeline
├── cache/redis_cache.py      Two-tier: Redis 300s TTL + in-process LRU 60s TTL
├── monitoring/metrics.py     Prometheus metric catalog
├── monitoring/drift.py       PSI feature drift detection
├── security/auth.py          JWT HS256 + bcrypt RBAC
└── security/rate_limiter.py  Sliding-window — atomic Redis Lua
```

### 7.1 30-Feature Schema

| Category | Features |
| :--- | :--- |
| Team | `team_size`, `founder_experience_yrs`, `previous_exits`, `has_linkedin`, `has_github` |
| IP & Press | `patent_count`, `press_count`, `awards_count` |
| Financials | `current_revenue`, `revenue_growth_rate`, `gross_margin`, `runway_months`, `ltv_cac_ratio` |
| Traction | `customer_count`, `mau` |
| Market | `tam`, `sam`, `market_growth_rate` |
| Stage | `stage_seed`, `stage_series_a`, `stage_series_b_plus` |
| Company | `founded_years_ago` |
| Pitch Quality | `pitch_count`, `total_likes`, `total_offers`, `has_problem_section`, `has_solution_section`, `has_traction_section`, `has_financials_section`, `has_video` |

All features normalised to `[0, 1]` with per-feature caps.

### 7.2 Circuit Breaker

```mermaid
stateDiagram-v2
    [*] --> CLOSED
    CLOSED --> OPEN : failure_count >= threshold
    OPEN --> HALF_OPEN : timeout elapsed
    HALF_OPEN --> CLOSED : probe succeeds
    HALF_OPEN --> OPEN : probe fails
    note right of OPEN : All calls route\nto heuristic fallback
```

Config: `CIRCUIT_BREAKER_THRESHOLD=5`, `CIRCUIT_BREAKER_TIMEOUT=60s`

### 7.3 PSI Drift Detection

```mermaid
flowchart LR
    NP["Production Batch"] --> DD["DriftDetector PSI"]
    REF["Reference Distribution"] --> DD
    DD -->|PSI < 0.1| OK["No change"]
    DD -->|0.1 to 0.2| WARN["WARN moderate drift"]
    DD -->|PSI >= 0.2| ALERT["ALERT retrain recommended"]
    DD --> PROM["feature_drift_score gauge"]
```

`MIN_SAMPLES=50`. Percentile-binned histogram via `np.histogram`. Reference updated via `DriftDetector.update_reference()` post-retraining.

### 7.4 Prometheus Metric Catalog

| Metric | Type | Labels |
| :--- | :--- | :--- |
| `predictions_total` | Counter | model, source, environment |
| `prediction_errors_total` | Counter | error_type, environment |
| `prediction_latency_seconds` | Histogram | model, environment |
| `batch_size_histogram` | Histogram | — |
| `model_accuracy` | Gauge | model_version |
| `feature_drift_score` | Gauge | feature_name |
| `cache_hits_total` | Counter | environment |
| `cache_misses_total` | Counter | environment |
| `circuit_breaker_open` | Gauge | name |
| `http_requests_total` | Counter | method, endpoint, status_code |
| `http_request_duration_seconds` | Histogram | method, endpoint |

### 7.5 ML API Endpoints

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/health` | GET | Liveness + model status |
| `/ready` | GET | Kubernetes readiness probe |
| `/metrics` | GET | Prometheus text exposition |
| `/predict/success` | POST | Single startup prediction |
| `/predict/batch` | POST | Parallel batch up to 100 |
| `/predict/embedding` | POST | Sentence-transformer embedding |
| `/model/info` | GET | Feature schema + version + registry |
| `/model/reload` | POST | Hot-reload without restart |
| `/api/v1/models/activate` | POST | Activate registry version (admin) |
| `/api/v1/models/{version}` | DELETE | Remove version (admin) |

---

## 8. ML Algorithms — Intelligence Sub-Package

`backend/apps/intelligence/ml/` — five deterministic engines, fully auditable.

### 8.1 Bayesian Update Engine

```mermaid
flowchart LR
    A["Initialize Prior\nBeta(alpha,beta)\nstage + sector"] --> B["Sector Volatility\n1.0x to 1.5x"]
    B --> C["Receive Evidence\npos / neg weight"]
    C --> D["Update Posterior\nalpha' = alpha + pos x conf\nbeta' = beta + neg x conf"]
    D --> E["Credible Intervals\n5th / 50th / 95th"]
    E --> F["ProbabilisticBelief\n+ update_history"]
    F -->|new evidence| C
```

**Stage Priors**:

| Stage | α | β | Baseline P |
| :--- | :--- | :--- | :--- |
| Pre-seed | 2.0 | 18.0 | ~10% |
| Seed | 3.0 | 12.0 | ~20% |
| Series A | 5.0 | 10.0 | ~33% |
| Series B | 6.0 | 6.0 | ~50% |

**Sector Volatility Multipliers**:

| Sector | Multiplier |
| :--- | :--- |
| consumer | 1.5× |
| climate_hardware | 1.4× |
| ai_infrastructure | 1.3× |
| healthtech | 1.2× |
| fintech | 1.1× |
| enterprise_saas | 1.0× |

Outputs: `posterior_probability`, `credible_interval_5/50/95`, `uncertainty_score`, `update_history`.

### 8.2 Anomaly Detection Engine

```mermaid
flowchart TD
    A["Claimed Metric"] --> B{"vs sector benchmarks"}
    B -->|"> 2 x P95"| C["HIGH — verification priority"]
    B -->|"P95 < v <= 2xP95"| D["MEDIUM — secondary docs"]
    B -->|"<= P95"| E["LOW — within range"]
```

`enterprise_saas` benchmarks: MoM growth % (P95=50), gross margin % (P95=92), NRR % (P95=150), CAC payback months (P95=24).

### 8.3 Venture Outcome Predictor

```mermaid
flowchart TD
    A["stage · sector\nfundability_score\nclaimed_metrics"] --> B["BayesianUpdateEngine"]
    A --> C["AnomalyDetectionEngine"]
    B --> D["SurvivalAnalysisEngine"]
    B --> E["5 Outcome Heads"]
    E --> F["Series A 18m 5-95%"]
    E --> G["Series B 36m 3-90%"]
    E --> H["$10M ARR 5y 2-85%"]
    E --> I["$100M Val 5y 1.5-75%"]
    E --> J["Unicorn $1B 0.5-25%\nlong-tail power law"]
    C & D & F & G & H & I & J --> K["UnicornProbabilityProfile"]
```

Confidence tiers: `VERY_HIGH` (evidence >= 85%, uncertainty < 1.0) → `HIGH` → `MODERATE` → `SPECULATIVE`

### 8.4 Weibull Survival Analysis

```
F(t) = 1 - exp( -(t / lambda)^k )

lambda  adjusted by traction velocity
k = 1.35  when runway < 12 months
k = 1.15  otherwise
h(t) = (k/lambda) x (t/lambda)^(k-1)
```

```mermaid
xychart-beta
    title "Weibull Fundraising Curve (Seed, 70% traction)"
    x-axis ["3m", "6m", "9m", "12m", "18m", "24m", "36m"]
    y-axis "P(round closed) %" 0 --> 100
    line [8, 19, 31, 43, 62, 76, 91]
```

### 8.5 Behavioral Sequence Model (Markov)

```mermaid
flowchart LR
    VP["VIEW_PROFILE\n5.0"] --> VPi["VIEW_PITCH\n10.0"]
    VPi --> DD["DOWNLOAD_DECK\n25.0"]
    DD --> VDR["VIEW_DATAROOM\n45.0"]
    VDR --> RV["RETURN_VISIT\n60.0"]
    RV --> RI["REQUEST_INTRO\n80.0"]
    RI --> SO["SUBMIT_OFFER\n100.0"]
    SO --> T1["IMMINENT_TERM_SHEET >= 80"]
    RI --> T2["HIGH_CONVICTION >= 55"]
    VDR --> T3["WARM >= 30"]
    VP --> T4["COLD < 30"]
```

Velocity factor: events within 7 days earn up to **1.3× conviction multiplier**.

| Score | Tier | Next Action |
| :--- | :--- | :--- |
| >= 80 | IMMINENT_TERM_SHEET | Prepare IC memo + cap table |
| >= 55 | HIGH_CONVICTION | Partner deep-dive call |
| >= 30 | WARM | Updated traction + references |
| < 30 | COLD | Monitor signals |

### 8.6 Historical Time Machine

```mermaid
sequenceDiagram
    participant C as Client
    participant TM as TimeMachine
    participant M as Metrics
    C->>TM: evaluate(cohort, point_in_time)
    TM->>TM: drop events after point_in_time
    TM->>M: compute_calibration_metrics(preds, truth)
    M->>M: Brier = (1/n) x sum((pred-actual)^2)
    M->>M: Precision@Top25% and @Top50%
    M-->>C: leakage_check_passed=True + metrics
```

---

## 9. Intelligence Sub-Services

### 9.1 Four-Stage DD Pipeline

```mermaid
flowchart LR
    S["Startup"] --> FA["Stage 1\nForensicAuditor\nUnit economics\nRed flags\nFounder signals"]
    FA --> MS["Stage 2\nMarketStrategist\nTAM validation\nCompetitive landscape\nMarket timing"]
    MS --> MP["Stage 3\nManagingPartner\nBull/Bear synthesis\nVerdict\nScorecard 7 dims"]
    MP --> MG["Stage 4\nMemoGenerator\nFull IC memo\nLP-ready export"]
```

**Scorecard dimensions**: `innovators`, `market`, `product`, `financials`, `timing`, `competitive_moat`, `execution`

**Verdict values**: `invest` / `pass` / `monitor` / `needs_info`

Each stage falls back to deterministic heuristic when `ENABLE_AI_FEATURES=False`.

### 9.2 Hybrid RAG Engine

```mermaid
flowchart LR
    Q["Query"] --> BM25["BM25 Sparse\nToken Match\n0.4 weight"]
    Q --> DENSE["Dense Cosine\nEmbedding\n0.6 weight"]
    BM25 --> RERANK["Hybrid Reranker\nSearchDocumentChunk"]
    DENSE --> RERANK
    RERANK --> TOP["Top-K Results"]
```

ChromaDB is the vector store. Token-overlap fallback when ChromaDB unavailable.

### 9.3 Forensic Underwriting — 8 Dimensions

```mermaid
flowchart TD
    DECK["Pitch Deck PDF/PPTX"] --> PARSE["deck_parser.py\nOpenXML / PyMuPDF\nFX normalisation\nMath integrity\nContradiction detection"]
    PARSE --> S1["Problem Defensibility 15%"]
    PARSE --> S2["Solution Moat / IP 15%"]
    PARSE --> S3["Business Model / Unit Econ 15%"]
    PARSE --> S4["GTM / Distribution 15%"]
    PARSE --> S5["Market TAM / SAM 10%"]
    PARSE --> S6["Competitive Moat 10%"]
    PARSE --> S7["Founder Spike / Execution 10%"]
    PARSE --> S8["Regulatory & Currency\nDefensibility 10%"]
    S1 & S2 & S3 & S4 & S5 & S6 & S7 & S8 --> LEDGER["ScoreLedger\nevidence_confidence_adj\nstage_alignment_adj\nunsupported_claim_adj"]
    LEDGER --> OUT["fundability_score\nConvictionBand\nStageAssessment\n3-Tier Competitors"]
```

**SMI (Startup Maturity Index)**: starts 15, +20 MVP, +25 paying customers, +15 retention.
**Competitor tiers**: Tier 1 incumbents / Tier 2 direct / Tier 3 adjacent.

### 9.4 Digital Brain

Three operations on `InstitutionalMemoryEntry` backed by ChromaDB:

| Operation | Method | Notes |
| :--- | :--- | :--- |
| Ingest | `ingest_source()` | SHA-256 dedup; source types: ic_memo, partner_note, pitch_deck, post_mortem, thesis |
| Query | `query_memory()` | Token-overlap fallback when ChromaDB unavailable |
| Lint | `lint_memory()` | Contradiction detection + orphan entry detection |

### 9.5 Stealth Founder Collectors

```mermaid
flowchart TD
    GH["GitHubActivityCollector\ncommit velocity + new repos"] --> ER
    DOM["DomainRegistrationCollector\n.ai domains + SSL + waitlist"] --> ER
    PAT["PatentCollector\nUSPTO / WIPO provisionals"] --> ER
    EMK["EmergingMarketsCollector\nCAC Nigeria\nCIPRO South Africa\nADGM UAE · DIFC UAE\nGAZT Saudi Arabia"] --> ER
    ER["EntityResolutionEngine\ncross-source dedup\ncomposite_velocity_score\nstealth heuristic <= 3 signals"]
    ER --> RP["ResolvedFounderProfile"]
```

### 9.6 Voice Interview Scoring

**Stage questions**: pre_seed (4 Qs: Founder Spike, Customer Discovery), seed (3 Qs: Unit Economics, NRR), series_a (2 Qs: Expansion, Moat).

```
composite = 0.30 x communication_clarity
          + 0.40 x domain_depth
          + 0.30 x founder_conviction
```

**Tiers**: >= 75 → Fast-Track Partner Interview · >= 50 → Standard Diligence Review · < 50 → Pass/Keep on Radar

### 9.7 Investment Knowledge Graph

**Node types** (6): FOUNDER, STARTUP, INVESTOR, FUND, MARKET, COMPETITOR
**Edge types** (4): FOUNDED, INVESTED_IN, OPERATES_IN, COMPETES_WITH

Traversals: `find_co_investors(investor_id)`, `find_competitor_cluster(startup_id)`

### 9.8 Financial Usage Metering

| Action | Unit Cost |
| :--- | :--- |
| Voice session start | 15 |
| Deck upload / underwriting | 10 |
| Stealth discovery sweep | 8 |
| Predict outcomes | 5 |
| Digital Brain query | 2 |

### 9.9 B2B Licensing Tiers

| Tier | Monthly Quota | Key Format |
| :--- | :--- | :--- |
| STARTER | 50 units | `pm_live_` + 48-char hex (SHA-256 stored) |
| PRO | 200 units | `pm_live_` + 48-char hex |
| ENTERPRISE | Unlimited | `pm_live_` + 48-char hex |

### 9.10 RBAC Security Policy

```mermaid
flowchart TD
    U["User + Role"] --> SPE["SecurityPolicyEngine\nis_authorized(role, classification, action)"]
    SPE --> CC["Clearance Matrix\n6 roles x 5 classification tiers"]
    CC --> PASS["Access Granted"]
    CC --> DENY["PermissionDenied"]
```

**Roles**: FOUNDER · INVESTOR · VENTURE_PARTNER · ANALYST · TENANT_ADMIN · SUPERADMIN
**Tiers**: PUBLIC → INTERNAL → CONFIDENTIAL → RESTRICTED → HIGHLY_RESTRICTED
Only VENTURE_PARTNER, TENANT_ADMIN, SUPERADMIN may access HIGHLY_RESTRICTED.

### 9.11 Domain Event Bus

In-process pub/sub decoupling pipeline stages:

```python
DomainEventBus.subscribe("PitchCreated", handler)
DomainEventBus.publish(DomainEvent(event_type="DeckUploaded", aggregate_id=pk, payload={}))
```

Fields: `event_id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload`

---

## 10. Predictive Intelligence ORM — 11 Model Sections

```mermaid
flowchart TD
    subgraph PRED["predictive_intelligence models"]
        FS["FEATURE STORE\nStartupFeatureSnapshot\n22 feature fields\nsnapshot_hash SHA-256\npoint-in-time provenance"]
        KG["KNOWLEDGE GRAPH\nGraphEntity 12 types\nGraphRelation 18 types\nGNN embedding vectors"]
        TML["TEMPORAL ML\nVentureSurvivalForecast\nWeibull / Cox PH\nLog-Normal / Kaplan-Meier\ncdf_curve_json with CI bounds"]
        TAB["TABULAR ML\nVentureOutcomePrediction\n20+ probability fields\n7 outcome heads x multiple horizons\nRevenue forecast 12/24/36m\nValuation forecast 24/60/84m"]
        BAY["BAYESIAN\nBayesianUpdateLog\nprior/posterior alpha/beta per step\nevidence type + CI percentiles"]
        UNC["UNCERTAINTY\nUncertaintyDecomposition\n5 sources: data_sparsity\nevidence_conflict / epistemic\naleatoric / calibration"]
        CAL["CALIBRATION\nCalibrationRecord\nPlatt / isotonic / beta\ntemperature scaling + ECE"]
        REG["MLOPS REGISTRY\nModelRegistry · ModelVersion\nTrainingRun · EvaluationRun\nPredictionRun · Experiment\nAICapability · AIProviderUsageLog"]
        INV["INVESTOR ML\nInvestorIntentPrediction\n5 prob heads P(interest/intro/DD/offer/invest)\nInvestorBehavioralSequence\n12 event types · 5 horizons"]
        ANO["ANOMALY\nAnomalyDetectionRecord\n5 methods: IsolationForest\nLOF · robust z-score\npercentile benchmark · autoencoder\nanalyst resolution workflow"]
        HIST["HISTORICAL SNAPSHOTS\nStartupHistoricalSnapshot\n6 ground-truth milestones\nactual valuation at exit\nzero look-ahead enforced"]
    end
```

**Reproducibility chain**: `PredictionRun → ModelVersion → FeatureSetVersion → EvidenceSnapshot`

---

## 11. Analytics — Startup Scoring Engine

Deterministic heuristic, no ML dependency.

**5-Dimension Weights**:

| Dimension | Weight |
| :--- | :--- |
| Team | 0.35 |
| Market | 0.25 |
| Traction | 0.20 |
| Financials | 0.15 |
| Product | 0.05 |

**Extended outputs**: exit prediction, ROI projection (3/5/10 yr, best/worst/median), market potential score, growth phase (hypergrowth/fast_growth/growth/early_stage + hockey_stick_year), risk profile (5-dim breakdown + mitigations), peer benchmarks, confidence interval from 10-field `_data_completeness()`.

---

## 12. Matching Algorithm

5-dimension cosine compatibility:

| Dimension | Weight | Method |
| :--- | :--- | :--- |
| Industry | 0.30 | Jaccard-like overlap ratio |
| Stage | 0.25 | Exact match |
| Ticket size | 0.25 | Inversely proportional to range distance |
| Location | 0.10 | Geographic containment |
| Semantic | 0.10 | Cosine on `embedding_vector` (0.5 neutral fallback) |

---

## 13. Secure Data Room

```mermaid
flowchart LR
    DOC["Document Upload"] --> VER["DocumentVersion\nversion_number · sha256_hash\nvirus_scan_passed · change_summary"]
    DOC --> FOLDER["DataRoomFolder\nhierarchical parent FK\ndefault_classification"]
    GRANT["DataRoomAccess\nNDA signed"] --> FLAGS["Per-category boolean flags\ncan_view_financials · legal\ntechnical · market · team · product"]
    GRANT --> WATER["watermark_text\nauto: investor CONFIDENTIAL date"]
    GRANT --> TTL["access_expires_at\nTTL-based revocation"]
    VIEW["Any action"] --> AUDIT["DataRoomAuditLog\nVIEW / DOWNLOAD / PRINT / EXPORT\nIP + user_agent"]
    SLIDE["Per-slide events"] --> HEATMAP["SlideTelemetryView\navg seconds per slide\ncompletion rate + drop-off"]
```

**5 Classification Tiers**: PUBLIC → INTERNAL → CONFIDENTIAL → RESTRICTED → HIGHLY_RESTRICTED

---

## 14. Data Flows

### 14.1 Authentication

```mermaid
sequenceDiagram
    participant B as Browser
    participant BFF as Next.js BFF
    participant DJ as Django
    participant PG as PostgreSQL
    B->>BFF: POST /api/auth/login
    BFF->>DJ: POST /api/v1/users/auth/login/
    DJ->>PG: Argon2 validate
    PG-->>DJ: User object
    DJ-->>BFF: access_token 30min + refresh_token 7day
    BFF-->>B: httpOnly cookies
    B->>DJ: Bearer token on all API calls
```

### 14.2 Forensic Deck Underwriting

```mermaid
sequenceDiagram
    participant F as Frontend
    participant DJ as Django
    participant DP as deck_parser.py
    participant FS as forensics.py
    participant ML as ML Sub-Package
    participant PG as PostgreSQL
    F->>DJ: POST /forensics/deck/upload/
    DJ->>DP: parse(bytes) + FX + math checks
    DP-->>DJ: NormalisedDeck
    DJ->>FS: analyze_deck_content(stage, sector)
    FS->>ML: BayesianUpdateEngine.update_belief()
    FS->>ML: AnomalyDetectionEngine.audit_metric()
    FS->>ML: VentureOutcomePredictor.predict_venture_outcomes()
    FS->>ML: SurvivalAnalysisEngine.calculate_fundraising_survival_curve()
    FS-->>DJ: ForensicReport
    DJ->>PG: PitchDeckForensicAnalysis.create()
    DJ-->>F: fundability_score + survival_curve + unicorn_prob + anomaly_reports
```

### 14.3 ML Prediction

```mermaid
sequenceDiagram
    participant DJ as Django
    participant PS as PredictionService
    participant CA as Cache
    participant CB as CircuitBreaker
    participant XGB as XGBoost
    participant HF as Heuristic
    DJ->>PS: predict(startup_data)
    PS->>CA: get() MISS
    PS->>PS: extract_features (30 features normalised 0-1)
    PS->>CB: protect()
    CB->>XGB: DMatrix predict()
    XGB-->>PS: probability
    PS->>PS: simulate_roi(prob)
    PS->>PS: predict_exit(prob)
    PS->>PS: top_shap_features()
    PS->>CA: set(ttl=300s)
    PS-->>DJ: success_probability + roi + exit + shap
    note over CB,HF: OPEN -> heuristic
    CB--xPS: CircuitBreakerOpenError
    PS->>HF: weighted_sum -> 0.1 to 0.9
```

### 14.4 Venture Outcome Generation

```mermaid
sequenceDiagram
    participant C as Client
    participant V as VentureOutcomeGenerateView
    participant OP as VentureOutcomePredictor
    participant PG as PostgreSQL
    C->>V: POST /api/v1/predictive/outcomes/startup/{pk}/generate/
    V->>OP: predict_venture_outcomes(stage, sector, metrics)
    OP->>OP: Bayesian update
    OP->>OP: Anomaly audit
    OP->>OP: Survival curve 7 horizons
    OP->>OP: 5 milestone probability heads
    OP-->>V: UnicornProbabilityProfile
    V->>PG: VentureOutcomePrediction.create()
    V->>PG: VentureSurvivalForecast.create() x milestones
    V->>PG: BayesianUpdateLog.create() per step
    V->>PG: UncertaintyDecomposition.create()
    V-->>C: full serialized prediction
```

---

## 15. Real-Time & Async Infrastructure

```mermaid
flowchart LR
    subgraph Django["Django ASGI"]
        HTTP["HTTP REST"]
        WS["WebSocket Consumers"]
    end
    subgraph Celery["Celery Workers"]
        ML_Q["ml queue\nmatching · analytics · intelligence"]
        DEF_Q["default queue\nmarketing · notifications"]
        BEAT["Celery Beat\nDatabaseScheduler"]
    end
    subgraph Redis["Redis 7"]
        R0["DB0 Cache + Sessions"]
        R1["DB1 Broker"]
        R2["DB2 Results"]
        CH["Channel Layer"]
    end
    HTTP --> R0
    WS <--> CH
    HTTP --> R1
    Celery --> R2
    BEAT --> R1
```

**Celery Beat Schedule**:

| Task | Schedule | Queue |
| :--- | :--- | :--- |
| `matching.update_all_match_scores` | Nightly 2 AM UTC | ml |
| `analytics.update_all_predictions` | Nightly 3 AM UTC | ml |
| `analytics.update_investor_behavior_all` | Weekly Sunday 4 AM UTC | default |
| `marketing.send_all_active_campaigns` | Daily 9 AM UTC | default |

---

## 16. Full Intelligence Architecture

```mermaid
flowchart TD
    Deck["Pitch Deck\nPDF / PPTX"] --> DP["deck_parser.py\nOpenXML · PyMuPDF\nFX Normalisation\nMath Checks · Contradictions"]
    DP --> FS["forensics.py\n8-Dim Scoring Engine\nSMI · ScoreLedger\n3-Tier Competitors"]
    FS --> BAY["Bayesian Engine\nBeta-Binomial\nStage+Sector Priors\nCredible Intervals"]
    FS --> ANO["Anomaly Detector\nPercentile Benchmarks\nP95 Thresholds"]
    BAY --> SURV["Weibull Survival\n7 Horizons\nVelocity-Adjusted"]
    BAY --> OUT["Venture Outcome\n5 Milestone Heads"]
    SEQ["Behavioral Sequences\nMarkov Journey\nVelocity-Weighted"] --> FS
    TM["Time Machine\nPoint-in-Time Filter\nBrier Calibration"] --> FS
    GRAPH["Knowledge Graph\nCo-investor Cluster\nCompetitor Traversal"] --> FS
    BRAIN["Digital Brain\nHybrid RAG BM25+Dense\nChromaDB vector store"] --> LLM
    STEALTH["Stealth Collectors\nGitHub · Domain · Patent\nCAC · CIPRO · ADGM\nDIFC · GAZT"] --> LLM
    VOICE["Voice Screener\n3-Metric Rubric\nStage Questions"] --> LLM
    FS --> LLM["LLM Optional\nOpenAI / Gemini\nOpenRouter / noop"]
```

---

## 17. Security Architecture

| Layer | Mechanism |
| :--- | :--- |
| Reverse Proxy | Caddy 2.8 — automatic TLS |
| Auth | JWT Access **30 min** + httpOnly Refresh 7 day |
| Password Hashing | Argon2 → PBKDF2 → BCrypt fallback |
| ML Auth | HS256 JWT + `require_admin` RBAC (bcrypt passwords) |
| Rate Limiting | Sliding-window atomic Redis Lua; memory fallback; fail-open |
| Circuit Breaker | CLOSED / OPEN / HALF_OPEN — XGBoost inference |
| RBAC | SecurityPolicyEngine — 6 roles × 5 classification tiers |
| Token Blacklist | simplejwt.token_blacklist + `ROTATE_REFRESH_TOKENS=True` |
| Data Isolation | All queries scoped to `request.user` |
| Data Room | SHA-256 doc hashing, virus scan flag, per-action audit log |
| B2B API Keys | SHA-256 hash; `pm_live_` prefix; provisioning audit |
| ChromaDB | Token-auth via `CHROMA_AUTH_TOKEN` |
| CORS | Strict allowlist; `CORS_ALLOW_ALL_ORIGINS=True` in DEBUG only |
| Domain Events | `DomainEventBus` — in-process fan-out, no external exposure |

### ML Security

```mermaid
flowchart LR
    subgraph RL["Rate Limiter"]
        REQ["Request client_id + weight"] --> RD{Redis?}
        RD -->|Yes| LUA["Atomic Lua\nZREMRANGEBYSCORE\nZCARD · ZADD · EXPIRE"]
        RD -->|No| MEM["threading.Lock\ndefaultdict\neviction 120s"]
        LUA -->|1| OK["200 Allow\nX-RateLimit-Remaining"]
        LUA -->|0| BLOCK["429 Retry-After"]
    end
    subgraph RBAC["JWT Auth"]
        T["Bearer token"] --> GCU["get_current_user\nHS256 decode"]
        GCU -->|valid| RA["require_auth"]
        RA -->|admin| RADM["require_admin"]
        GCU -->|invalid| E401["401"]
        RADM -->|denied| E403["403"]
    end
```

---

## 18. Deployment Topology

```mermaid
flowchart TD
    CDN["CDN / Vercel Edge\nNext.js static assets"]
    Caddy["Caddy 2.8\nAutomatic TLS"]
    Next["Next.js Node 20 Cluster"]
    DJ["Django ASGI\nUvicorn x4 workers"]
    ML["FastAPI ML Service\nUvicorn · Docker · port 5000"]
    PG["PostgreSQL 16\nRDS / Supabase"]
    Redis["Redis 7\nElastiCache"]
    Chroma["ChromaDB 0.5\nDocker volume chroma_data"]
    Celery["Celery Workers\nqueues: default + ml"]
    Beat["Celery Beat\nDatabaseScheduler"]
    S3["S3 / Object Storage"]
    Email["SES / Sendgrid"]
    MLVol["ml_models volume"]

    CDN --> Next
    Caddy --> Next & DJ & ML
    Next --> DJ
    DJ --> PG & Redis & Chroma & S3 & Celery & ML
    ML --> Redis & MLVol
    Celery --> PG & Email & Redis
    Beat --> Redis
```

**Docker volumes**: `postgres_data` · `redis_data` · `chroma_data` · `ml_models` · `backend_static` · `backend_media` · `caddy_data` · `caddy_config`

---

## 19. Platform Capabilities Summary

| Feature | Status | Technology |
| :--- | :--- | :--- |
| Startup & Investor profiles | Live | users app |
| Pitch creation & management | Live | pitches app, S3 |
| 5-dim cosine investor matching | Live | matching/services.py |
| Investment offers + WebSocket bids | Live | offers app |
| NDA-gated data room (5-tier classification) | Live | dataroom app |
| Folder hierarchy + document versioning | Live | DataRoomFolder, DocumentVersion |
| Per-action audit log + slide heatmap | Live | DataRoomAuditLog, SlideTelemetryView |
| Activity newsfeed | Live | newsfeed + WebSocket |
| Smart outreach campaigns | Live | marketing, Celery |
| 5-dim startup scoring engine | Live | analytics/services.py |
| **Bayesian belief updating** | Live | BayesianUpdateEngine — Beta-Binomial |
| **Anomaly detection** | Live | AnomalyDetectionEngine — P95 benchmarks |
| **Multi-task venture outcome prediction** | Live | VentureOutcomePredictor — 5 heads |
| **Weibull survival analysis** | Live | SurvivalAnalysisEngine — 7 horizons |
| **Investor behavioral sequences** | Live | BehavioralSequenceModel — Markov |
| **Historical time machine** | Live | HistoricalTimeMachine — Brier/leakage-free |
| **XGBoost prediction service** | Live | ml/predictor.py — 30 features, SHAP |
| **PSI drift detection** | Live | ml/monitoring/drift.py |
| **Sliding-window rate limiter** | Live | ml/security/rate_limiter.py — Redis Lua |
| **JWT RBAC (ML service)** | Live | ml/security/auth.py |
| 8-dim forensic deck underwriting | Live | forensics.py, deck_parser.py |
| **4-stage DD pipeline** | Live | pipeline.py (ForensicAuditor→MemoGenerator) |
| **Hybrid RAG (BM25 + dense 0.4/0.6)** | Live | rag.py + ChromaDB |
| Digital Brain ingest/query/lint | Live | digital_brain.py |
| Stealth radar — 5 registries | Live | collectors.py |
| Voice screening — 3-metric rubric | Live | voice_interviews.py |
| Knowledge graph traversal | Live | graph.py + predictive/views.py |
| 5-source uncertainty decomposition | Live | UncertaintyDecomposition |
| Platt/isotonic/beta calibration | Live | CalibrationRecord |
| MLOps experiment tracking | Live | ModelRegistry, EvaluationRun, Experiment |
| B2B licensing STARTER/PRO/ENTERPRISE | Live | licensing.py — SHA-256 keys |
| Financial usage metering | Live | metering.py |
| RBAC 6-role clearance matrix | Live | rbac.py, SecurityPolicyEngine |
| In-process domain event bus | Live | events.py, DomainEventBus |
| AI capability feature registry | Live | predictive_intelligence/ai_gateway.py |
| Accelerator cohort management | Live | Cohort, CohortApplication, ICMemoVote |
| Antler Hub bi-directional sync | Live | AntlerHubWebhookView |
| LP-ready IC memo export | Live | DueDiligenceExportView |
| Partner consensus IC voting | Live | DueDiligenceVoteView |
| Real-time notifications | Live | Django Channels + Redis |
| **Application Intelligence Engine** | **Live** | `/application-intelligence` — 15-section program-aware readiness dashboard |

---

## 20. Application Intelligence Engine

The **Application Intelligence Engine** transforms startup fundability analysis from generic scoring to **program-specific** readiness intelligence. Founders select a target program (accelerator, grant, VC, or competition) and Pitchmic builds a program-specific evaluation model, then measures the startup's structured evidence against it.

### 20.1 Three-Layer Intelligence Taxonomy

Every program insight is explicitly tagged **FACTS · SIGNALS · OUTCOMES** and the three layers are never mixed:

| Layer | Badge | Meaning |
| :--- | :--- | :--- |
| **L1 — FACTS** | OFFICIAL (green) | What the program officially says. Requirements, questions, deadlines, investment terms, eligibility. Cited directly from program materials. |
| **L2 — SIGNALS** | INFERRED (blue) | What Pitchmic infers. Derived from application questions, interview guides, public founder guidance, cohort patterns, partner statements. |
| **L3 — OUTCOMES** | OBSERVED (violet) | What Pitchmic observes from its own application→interview→acceptance dataset. Always phrased as "associated with higher interview rates", never "required." |

### 20.2 Dashboard Sections (15)

1. **Hero banner** — program selector + overall readiness score hero (CircularDial)
2. **Three-Layer Distinction Banner** — FACTS/SIGNALS/OUTCOMES definitions card
3. **Program Intelligence Profile Card** — type, stage, investment, geography, founder/evidence/interview bars
4. **Program Rubric Tabs** — Requirements / Application Questions / Selection Signals detail
5. **Startup Profile Synthesis** — auto-populated from `/company` with stage toggle (Idea / Pre-seed / Seed / Series A)
6. **Selection Readiness Score** — 8-dimension table (Founder/Team, Market, Problem, Product, Traction, Evidence, Competitive Advantage, Application Quality) with **stage-conditioned scoring** (zero-revenue is not Weak at Idea stage)
7. **Program Fit Analysis** — Strengths / Gaps / Risks 3-column grid
8. **Evidence Graph** — 3-way Declared / Verified / Observed values per claim, linked evidence items with confidence
9. **Hidden Evidence Scanner** — extracts quantified proof from uploaded artifacts and flags when the founder is underselling traction
10. **Evidence Gap Map** — 4-stage pipeline per requirement: WHAT THEY WANT → WHAT YOU CLAIM → WHAT YOU CAN PROVE → WHAT IS MISSING (with Recommendation)
11. **Application Strategy Builder** — 7 editable narrative subsections (Problem, Founder Advantage, Why Now, Proof, Program Fit, Primary Weakness, Mitigation) with local state save
12. **Multi-Program Readiness Comparison** — 5 programs scored against the SAME startup to prove "the evaluator changes, not the startup" (African accelerator ~91, Deep-tech ~38 for a Nigeria fintech MVP)
13. **Application Red Team** — rejection-vector bullets + 4-tier priority fixes with +score impact points
14. **Interview Simulation** — program-specific public questions → 6-dimension answer evaluation (Founder-market fit, Specificity, Evidence, Conviction, Memorability, Program alignment) + Evaluator Personas (Program Director, Investor, Technical, Skeptical)
15. **Funding Readiness Roadmap** — if baseline < 70 → "Don't submit yet" banner, 4 highest-impact pre-submission actions with +impact points and consistent arithmetic projected readiness
16. **Outcome Correlations** — L3 observations with cautious "associated with" language + caveats + sample-size hints

### 20.3 Type Safety & Coding Conventions

- All new types live in `frontend/src/lib/applicationIntelligenceApi.ts` (50+ interfaces, enums, pure computation functions)
- Zero `: any` across new code paths
- `ensureArray<T>()` defensive wrapper around all optional list-typed values before `.map()`
- `formatDate()` from `@/lib/utils` on all date fields
- Seed data matches the anticipated future backend API contract shape so no UI rewrite is needed when real endpoints land
- Defensive empty-state fallback UIs on every section

### 20.4 Acceptance Criteria Coverage (14/14 Rule + Rubric ACs)

| AC | Title | Status | Task-level TRs |
| :--- | :--- | :--- | :--- |
| AC-1 | Program Intelligence Profile with 3-layer source taxonomy | ✅ Pass | TR-3.1, TR-3.2, TR-3.3 |
| AC-2 | Selection Readiness 8-dimensions + stage-conditioned Traction | ✅ Pass | TR-4.1, TR-4.2, TR-4.3 |
| AC-3 | Evidence Graph links claims to evidence items | ✅ Pass | TR-5.1 |
| AC-4 | Hidden Evidence flags undersold traction (≥3 items + banner) | ✅ Pass | TR-5.2 |
| AC-5 | Evidence Gap Map 4-stage flow (≥2 rows with Recommendation) | ✅ Pass | TR-6.1 |
| AC-6 | Application Strategy 7 editable subsections | ✅ Pass | TR-6.2 |
| AC-7 | Red Team ≥4 rejection reasons + 4-tier priority fixes | ✅ Pass | TR-7.1 |
| AC-8 | Interview Simulation 6-dimension evaluation + low-evidence warning | ✅ Pass | TR-7.2 |
| AC-9 | Same startup → different program-specific scores (5 programs) | ✅ Pass | TR-8.1 (91 > 84; 38 ≤ all) |
| AC-10 | Roadmap "Don't submit yet" + 4 actions + consistent arithmetic | ✅ Pass | TR-8.2 (64 + 24 = 88 ✓) |
| AC-11 | FACTS/SIGNALS/OUTCOMES never mixed + "associated with" language | ✅ Pass | TR-8.3 |
| AC-12 | 100% TypeScript, tsc passes, zero `: any` | ✅ Pass | TR-1.1, TR-1.2, TR-9.1 |
| AC-13 | Visual fidelity — reuses existing primitives & tokens | ✅ Pass (Rubric ≥4) | TR-2.3, TR-3.3, TR-5.3, TR-6.3, TR-7.3, TR-9.4 |
| AC-14 | Information density — scannable story flow ≤60s | ✅ Pass (Rubric ≥4) | TR-8.4, TR-9.4 |

---

## 21. Accelerator OS — Venture Admissions & Selection Intelligence

The **accelerator** app is the surface a program team works in all day: the intake door, the
review queue, the evidence graph, the committee room, and the methodology CMS that configures
them. It is the largest app in the backend — **82 models**, **56 registered viewsets** plus
`context/`, `work-inbox/`, `evidence-graph/`, `intake/*` and `program-studio/seed/`, mounted at
`/api/v1/accelerator/` — and it renders at `/accelerator` on the Next.js dashboard.

### 21.1 Three Rules the Whole Surface Obeys

| Rule | What it prevents | Enforcement |
| :--- | :--- | :--- |
| **Humans hold the verdict** | A model output becoming an admission decision | No engine writes the decision row. `run_automated_triage()` assigns an A/B/C/D screening **tier** and an audit event; `queue_bucket()` labels an attention lane; `evaluate_program_eligibility()` grades only against rules the program itself configured and is shown as a reviewable requirement breakdown. `ACCEPTED · REJECTED · WAITLISTED · DEFERRED · EVIDENCE_REQUESTED` is persisted only by a person via `applications/{id}/record-decision/`, and `finalize-decision` refuses to settle a committee result below quorum. |
| **The database is the source of truth** | A model, cache or browser copy deciding what is true | Every readout in the dashboard is computed server-side (`screening-summary/`, `reviewer-consensus-report/`, `diligence-items/rollup/`, `work-inbox/`). The client never re-ranks, re-tallies or re-derives. |
| **Missing is not zero** | An unset value being displayed as a decided one | Unset renders `—`, never `0`. `cohort_runtime()` reports "No dates set" rather than inventing a 12-week plan; `member_count` returns `null` when a role slug folds onto no staff code; an undated diligence question reports `due_at: null` **and** `overdue: null`. |

Terminology is deliberate: the weights and dimensions a program decides by are its
**Selection Framework**, and the engines behind them are **ML** — the codebase does not call a
deterministic rank "AI", and the word "Thesis" is reserved for the founder-facing narrative, not
a scoring policy.

### 21.2 The Selection Lifecycle

```mermaid
flowchart LR
    Intake["Intake<br/>external key · CSV/XLSX · founder submit"] --> Stage["Staged row<br/>IntakeSubmission"]
    Stage -->|"a named human accepts"| App["AcceleratorApplication<br/>+ founder account (unclaimable until reset)"]
    App --> Triage["Automated triage<br/>tier + eligibility + risk points"]
    Triage --> Queue["Review Queue<br/>priority · investigate · hold · needs_evidence · wildcard"]
    Queue --> Review["Scorecards<br/>5 dimensions, one live row per reviewer"]
    Review --> DD["Due diligence<br/>questions with owner + due date"]
    Review --> Interview["Interviews<br/>schedule · transcript turns · recorded claims"]
    DD --> IC["Decision Room<br/>committee votes + quorum"]
    Interview --> IC
    IC --> Decision["Committee decision<br/>ACCEPTED · REJECTED · WAITLISTED ·<br/>DEFERRED · EVIDENCE_REQUESTED"]
    Decision --> Cohort["Cohort OS<br/>membership · curriculum · mentors"]
    Cohort --> Outcome["Outcomes<br/>metrics · demos · surveys · recall"]
    Outcome -.->|"feeds"| Memory["Program memory<br/>blueprints · recall report"]
```

### 21.3 Data Model

| Module | Models | Owns |
| :--- | :--- | :--- |
| `models.py` | 23 | The orchestration spine: `AcceleratorProgram`, `AcceleratorApplication`, questions/responses, `ApplicationDocument`, `ApplicationClaim` + `ClaimEvidence`, `ReviewerAssessment`, `ReviewerDisagreement`, `InterviewSession` (+ append-only transcript turns), `CommitteeDecision`, `EvidenceRequest`, `DiligenceItem`, milestones, notes/comments, `ApplicationAuditEvent` |
| `models_config.py` | 15 | Workflow OS (`ProgramStage`, `StageTransition`), Application OS (`FormDefinition`→`FormSection`→`FormQuestion`→`QuestionOption`, `FormResponse`), custom objects/fields/records, notification templates + notifications, `EventOutbox`, `ProgramRole`, `DashboardReport` |
| `models_os.py` | 41 | Organizations, `ApplicationCycle` (+ hashed intake key), `ReviewAssignment`, `ReviewerProfile`, `ProgramStaffMembership`, mentors, cohort events, demo day, offers, outcomes, `ProgramMemoryEntry`, `ProgramBlueprint`, `WorkflowAutomation` |
| `program_policy.py` | 2 | `ProgramArchetype`, `ProgramEvaluationPolicy` — the versioned weights, hard gates and reviewer/interview/decision rules a program actually scored by |
| `rules_engine.py` | 1 | `ProgramRule` (persisted eligibility and screening rules) |

17 migrations (`0001_initial` … `0017_alter_applicationclaim_options`). `AcceleratorApplication`
is the state machine spine: stage transitions are validated against the program's own
`StageTransition` graph by `workflow_engine.load_graph()`, never against a hardcoded list.

### 21.4 Screens

| Route | Screen | Backing data |
| :--- | :--- | :--- |
| `/accelerator` | Command Center — what needs a human now, plus the funnel | `applications/screening-summary/`, `applications/` (paged), `applications/{id}/allowed-transitions/`, `transition-status/`, `evidence-requests/` |
| `/accelerator/applications` | List + tabs: Selection Matrix, Eligibility & Triage, Reviewer Consensus, Interview Operations, dossier drawer | `applications/` (+`?program_id=`), `eligibility-report/`, `reviewer-consensus-report/` |
| `/accelerator/applications/{id}` | Application 360 — scorecard, evidence graph, diligence, who was asked | `applications/{id}/assessment/`, `evidence-graph/`, `review-assignments/` |
| `/accelerator/review-queue` | Attention inbox with server-side aging and lane counts | `applications/`, `applications/screening-summary/` (`queue_bucket`, `risk_level`, `aging_days` all computed by `queue_routing`) |
| `/accelerator/interviews` | Scheduling rail + transcript capture | `interviews/`, `interviews/{id}/transcript/` |
| `/accelerator/due-diligence` | DD board: owner, due date, rollup | `diligence-items/`, `diligence-items/rollup/` |
| `/accelerator/decision-room` | Committee ballot, live tally, quorum | `committee/cast-vote/`, `programs/{id}/decision-room/` |
| `/accelerator/intelligence` | Evidence graph · contradictions · founder signals · company signals | `applications/`, `disagreements/`; the intelligence and evidence drawers fetch `evidence-graph/` on demand |
| `/accelerator/analytics` | Reports, top strengths, cohort-over-cohort deltas | `applications/screening-summary/`, `reviews/calibration/`, `applications/`, `outcomes/`, `program-memory/` |
| `/accelerator/outcomes` | Screening recall + program memory | `applications/` (screening diagnostics), `outcomes/`, `program-memory/` |
| `/accelerator/cohorts` | Cohort tracker (post-selection group) | `cohorts/`, `metric-snapshots/` |
| `/accelerator/settings` | Program Configuration — the methodology CMS (20 panels) | `stages/`, `transitions/`, `forms/`, `program-roles/`, `policies/`, `application-cycles/`, `intake-submissions/`, … |

The sidebar groups these by selection lifecycle, not by data type: **Overview → Applications →
Review Queue → Interviews → Due Diligence → Decisions → Intelligence → Analytics & Reports →
Outcomes → Program Configuration**, with Cohorts under a collapsed *Post-Selection* group.

### 21.5 Engines and Algorithms

| Module | What it computes |
| :--- | :--- |
| `queue_routing.py` | `risk_points()` → weighted screening risk with human-readable reasons; `risk_level()` (High ≥ 3, Medium ≥ 1, Low); `queue_bucket()` → one of `priority · investigate · hold · needs_evidence · wildcard`. Constants: `EVIDENCE_THIN_BELOW = 45.0`, `COMPLETENESS_HOLD_BELOW = 40.0`, `UNVERIFIED_CLAIMS_MANY = 3`, and `ACTIVE_FUNNEL_STATUSES` (rows outside the funnel are not aged). These are **lanes**, not verdicts. |
| `eligibility.py` | `evaluate_program_eligibility()` — each requirement graded `satisfied · uncertain · failed · requires_evidence` against the program's persisted rules, with `facts_from_application()` as the only input. `rule_defaults()` returns the engine's own fallbacks (geography whitelist, funding ceiling, full-time and incorporation gates) so the configuration screen can state the **effective** gate instead of rendering an unset key as "no gate"; verdict bands are `VERDICT_INELIGIBLE_FLOOR = 50` and `VERDICT_HIGHLY_ELIGIBLE_FLOOR = 80` on the satisfied share of weighted requirements. The founder's pre-application self-check (`POST /programs/{id}/check-eligibility/`, which persists nothing) and the reviewer's triage view call **this one function**, so the two can never disagree. |
| `program_runtime.py` | Reads the program's **active** `ProgramEvaluationPolicy` and exposes `compute_weighted_score()` and `evaluate_hard_gates()` — the single place a score's weights come from. A program may hold several policy versions but only one `is_active`, and `pipeline.advance()` snapshots `get_policy_version()` onto the `ApplicationAuditEvent` it writes, so a past score can still be explained. |
| `reviewer_intelligence.py` | Assignment recommendations (sector expertise, workload, COI via `_has_entity_conflict()`), disagreement detection, and the calibration report (lenient / harsh / balanced). |
| `decision_room.py` | `tally_committee_votes()` with `IC_QUORUM_MIN_VOTES`, `dimension_confidence()`, `mean_conviction()`, `get_selection_summary()`, `get_candidate_card()`. A result below quorum raises instead of settling. |
| `pipeline.py` | `ApplicationPipeline.advance()` — gated transitions with row locking, `run_automated_triage()` (A/B/C/D tiering only), `get_audit_trail()`. |
| `interview_guide.py` | `build_interview_guide()` (evidence-conditioned questions) and `pool_strength_ladder()` for cohort-level strengths. |
| `workflows.py` | `publish_event()` / `dispatch_event()` on the `EventOutbox`, so automations run off persisted state rather than a caller's claim. |
| `models.py` | `materiality_rank_expr()` / `materiality_ordering()` — claim ranking is `critical > high > medium > low`, unknown last, with `-pk` as the tiebreak so the same application returns the same claim set on every read. It is `ApplicationClaim.Meta.ordering`, which is why changing it needed a migration. |

### 21.6 Review Integrity

- **An ask is not a review.** `ReviewAssignment` records who the program asked (`assigned_by` is
  set by the server, never the client) and `unique_together = (reviewer, application, round_id)`.
  `scorecard_filed` is an `Exists()` subquery over `ReviewerAssessment`, annotated once per page —
  the seat is only "done" when a human's scorecard exists. An assignment is **not** a gate:
  `ReviewerAssessmentViewSet.perform_create` binds `reviewer=request.user` and needs no seat.
- **One live scorecard per human per application.** Re-submitting edits the existing row instead
  of adding a second ballot, so a reviewer cannot double-weight a tally.
- **Reviewer identity is never disclosed to founders**, and the assignment endpoints are
  staff-only for the same reason.
- **Disagreements are persisted, not implied.** Cross-reviewer gaps ≥ `AGREEMENT_TOLERANCE_POINTS`
  (`3.0`) on any of the five `REVIEW_DIMENSIONS` (`founder · market · product · team · traction`)
  create `ReviewerDisagreement` rows keyed on `(application, dimension, pair)` — recomputed
  idempotently over all reviewer pairs after every edit.
- **A recusal stays on the ledger.** `conflict_status` transitions are audited alongside who was
  assigned, and a recused seat is reported as recused — never as late.
- A scorecard cannot be filed on a `DRAFT` or `WITHDRAWN` application.

### 21.7 Evidence Honesty

- Document upload stores the file, marks `extraction_status="pending"`, and writes exactly **one**
  pending claim whose text quotes the founder's own declared figure (`DOCUMENT_CLAIM_KINDS`). It
  invents no confidence, no verification outcome and no `ClaimEvidence` row — a row of zeros would
  read as "checked, found nothing".
- Interview transcript turns are append-only, and `record-claim` produces an **unverified**
  `source='interview'` claim carrying session + turn provenance into the evidence graph.
- A real deck parser exists in the platform (`apps/intelligence/deck_parser.py` +
  `forensics.py`) but nothing in `apps/accelerator` imports it, so accelerator-side extraction is
  honestly still pending rather than silently claiming results.

### 21.8 Intake and the Identity Constraint

Every `AcceleratorApplication` requires a human `submitted_by`, which is what made bulk intake a
design problem rather than a loop. The resolution:

1. `POST /intake/ingest/` is the only unauthenticated endpoint in the app that **persists a row**.
   It is keyed by a cycle's `intake_key_hash` (the raw key is never stored);
   `GET|POST /application-cycles/{id}/intake-key/` reads and rotates it. Everything else that is
   `AllowAny` reads or simulates: the public program list/retrieve, `check-eligibility` (a
   preview that persists nothing), and `forms/{id}/render/`.
2. Submissions land in `ExternalIntakeSubmission` — a staging table. Nothing becomes an
   application until a **named** staff account calls `accept` (or `dismiss`).
3. Accepted rows create founder accounts with `password=None`, `is_verified=False`: an account
   that cannot sign in until its person claims it. That is deliberate, not a placeholder.
4. `/intake/import/` reads CSV/XLSX/JSON, proposes header mapping (`suggest_mapping()`), supports
   `commit:false` dry-run preview, and dedupes on natural identity `(email, company)` over staged
   rows. A typo'd company name intentionally returns as a new row.

### 21.9 Multi-Tenancy and RBAC

Two rules, because two things are protected — **role answers "which side of the table", the
program answers "whose programs"**:

| Helper | Rule |
| :--- | :--- |
| `programs_visible_to(user)` | Programs the account created **or** that are `is_public`. Reads, and writes of *work done inside* a program (notes, responses, records, notifications). |
| `programs_owned_by(user)` | Programs the account created. Configuration writes — stages, transitions, forms, roles, reports — because `is_public` is an intake switch, not an edit licence. |
| `_by_program(qs, request, field)` | Applies the tenant filter **before** the caller's `?program_id=`, so a query parameter can only narrow, never widen. Rows with no program survive reads. |
| `TenantScopedWriteMixin` | Refuses a POST/PATCH/DELETE whose **body** names a program outside the caller's scope — `PrimaryKeyRelatedField` resolves ids against the model manager, so the queryset never sees them. Program-less rows are a platform act, including delete. |
| `_scope_subsystem_to_program`, `_require_review_scope` | Same shape for application-hanging rows; bulk reads of reviewer/diligence records must be scoped. |
| `require_program_team_user` | One eligibility rule for "may this person be handed work" — review seats and diligence ownership share it. |

`GET /review-assignments/candidates/` answers "who can I ask, and what is their load?" with
per-program open/completed assignments, scorecards filed and open diligence counted in one query.

**Known open item:** several review-flow viewsets in `views.py` still scope by role rather than
tenant, and `ReviewAssignmentViewSet`'s create path plus `candidates`'s `?program_id=` bypass the
tenant filter (DRF's `create` never routes through `get_queryset`). Reported, not yet fixed.

### 21.10 Verification

`backend/Tests/smoke_*.py` — **21 scripts, ~800 assertions**, each run inside
`transaction.atomic()` with `set_rollback(True)` so nothing touches real data. They pin the
honesty rules, not just the happy paths: `smoke_application_tenant_scope` and
`smoke_config_tenant_scope` assert that an out-of-scope row is *not created* and the error names
the field that carried the tenant; `smoke_intake_and_import` pins staging, hashing and the accept
step; `smoke_document_upload_honesty` fails if a fabricated verification appears;
`smoke_quorum` proves a below-quorum committee cannot decide; `smoke_engine_honesty` and
`smoke_claim_ordering` guard provenance and deterministic ordering. Gates for any change here:
`manage.py check`, `makemigrations --check --dry-run` (no drift), the smoke battery,
`tsc --noEmit`, and a production `next build` — run while the dev server is **stopped**, since
both write to `.next`.

---

## 22. Getting Started

### Prerequisites

Python 3.11+, Node.js 20+, PostgreSQL 16+, Redis 7+, Docker

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
source venv/bin/activate    # Linux/macOS
pip install -r requirements.txt
cp ../.env.example ../.env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Celery

```bash
cd backend
celery -A config worker --loglevel=info -Q default,ml --concurrency=4
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### ML Service

```bash
cd ml
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

| Service | URL |
| :--- | :--- |
| Web App | `http://localhost:3000` |
| Django API | `http://localhost:8000` |
| ML Service | `http://localhost:5000` |
| API Docs (Django) | `http://localhost:8000/api/docs/` |
| API Docs (ML) | `http://localhost:5000/docs` |
| ML Metrics | `http://localhost:5000/metrics` |
| Application Intelligence | `http://localhost:3000/application-intelligence` |

### Local Build Verification

After applying patches, run the full CI-quality gates locally before committing:

```powershell
# Frontend type check (Windows PowerShell)
cd frontend
npx tsc --noEmit              # AC-12 gate

# Frontend lint (max-warnings=0 -> CI fail on warnings)
npx eslint --max-warnings=0 .  # CI frontend-lint gate

# Frontend production build (catches SSR/runtime import errors)
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:8000/api/v1"
npx next build                # CI frontend-build gate
```

Backend equivalents:

```powershell
cd backend
python -m ruff check .
python -m mypy .
python manage.py test
```

### Docker (full stack)

```bash
make dev        # build + migrate + start all containers
make lint       # ruff + eslint --max-warnings=0
make typecheck  # mypy + tsc --noEmit
make test       # pytest --cov-fail-under=85 + vitest --coverage
make ci         # lint -> typecheck -> test (fail-fast)
make reset-db   # dev DB reset
```

---

## 23. Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SECRET_KEY` | Django signing key | Required |
| `DATABASE_URL` | PostgreSQL connection | `sqlite:///db.sqlite3` |
| `REDIS_URL` | Redis URL | `redis://127.0.0.1:6379/0` |
| `CELERY_BROKER_URL` | Celery broker | `redis://localhost:6379/1` |
| `ENABLE_AI_FEATURES` | Master AI toggle | `False` (pure-ML mode) |
| `AI_DEFAULT_PROVIDER` | LLM provider | `noop` |
| `OPENAI_API_KEY` | OpenAI key | `""` |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL | `""` |
| `OPENAI_DEFAULT_MODEL` | OpenAI model | `gpt-4o-mini` |
| `GOOGLE_GEMINI_API_KEY` | Gemini key | `""` |
| `GEMINI_DEFAULT_MODEL` | Gemini model | `gemini-1.5-flash` |
| `OPENROUTER_API_KEY` | OpenRouter key | `""` |
| `OPENROUTER_DEFAULT_MODEL` | OpenRouter model | `meta-llama/llama-3.1-70b-instruct` |
| `NEXT_PUBLIC_API_URL` | Backend base URL | `http://localhost:8000` |
| `CORS_ALLOWED_ORIGINS` | Frontend origins | `http://localhost:3000` |
| `CHROMA_AUTH_TOKEN` | ChromaDB token auth | `pitchmic-chroma-secret` |
| `ML_SERVICE_URL` | ML service URL | `http://ml-service:5000` |
| `MODEL_PATH` | ML model artefacts directory | `/app/models` |
| `ML_API_KEY` | Static ML API key guard | `""` (disabled) |
| `JWT_SECRET_KEY` | HS256 secret for ML service | Required in prod |
| `CIRCUIT_BREAKER_THRESHOLD` | Failures before open | `5` |
| `CIRCUIT_BREAKER_TIMEOUT` | Seconds before half-open | `60` |
| `ENABLE_CACHE` | Prediction caching | `true` |
| `CACHE_TTL_SECONDS` | Cache TTL | `300` |
| `MAX_BATCH_SIZE` | Max batch prediction items | `100` |
| `RATE_LIMIT_REQUESTS` | Requests per window | `100` |
| `RATE_LIMIT_PERIOD_SECONDS` | Window length | `60` |

---

## 24. Quality & CI

```bash
# Backend tests (85% coverage minimum enforced)
cd backend && pytest --cov=. --cov-fail-under=85

# ML service tests
cd ml && pytest tests/

# Frontend TypeScript check
cd frontend && npx tsc --noEmit

# Frontend test
cd frontend && npx vitest run --coverage

# Frontend production build
cd frontend && npm run build
```

Coverage threshold: **85%** minimum (enforced in CI via `make test`).

---

## License

Proprietary. All rights reserved.
