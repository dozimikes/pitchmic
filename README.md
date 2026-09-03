# Pitchmic — Full Architectural Design

> **Platform Category**: AI-Native Venture Capital Intelligence & Founder-Investor Networking Platform
> **Runtime Stack**: Django 5 / Next.js 14 / FastAPI ML Service / PostgreSQL / Redis / Celery / WebSockets

---

## 1. System Overview

Pitchmic is a two-sided marketplace and intelligence platform connecting **startup founders** seeking capital with **institutional investors** (VCs, Angels, Accelerators). It layers a full AI + ML intelligence engine on top of the core networking workflows.

```
Browser (Next.js 14)
        |
        |-- HTTPS + JWT
        v
Next.js BFF (/api/auth/*)
        |
        |-- Cookie JWT proxy
        v
Django 5 REST Backend  <------>  FastAPI ML Service
        |                               |
        |-- Read/Write                  |-- Redis Cache
        v                               v
  PostgreSQL           Redis 7     XGBoost / Heuristic
        |                |
        v                v
  Celery Workers  <-- Broker/Results
        |
        v
  LLM Gateway (OpenAI / Gemini)  [optional]
```

---

## 2. Backend — Django Application Architecture

### 2.1 Configuration Layer

| Component | Technology | Notes |
| :--- | :--- | :--- |
| Web Server | **Django 5 + ASGI (Uvicorn)** | HTTP REST and WebSocket |
| Task Queue | **Celery 5 + django-celery-beat** | Async processing, scheduled runs |
| Message Broker | **Redis 7** (3 DBs) | `0` Cache, `1` Broker, `2` Results |
| Real-Time | **Django Channels 4 + channels-redis** | Redis in production |
| Auth | **djangorestframework-simplejwt** | Access + Refresh tokens, Argon2 |
| CORS | **django-cors-headers** | Configurable origin allowlist |
| ORM | **Django ORM + psycopg2** | SQLite dev / PostgreSQL prod |
| LLM Gateway | **OpenAI SDK + Google Gemini** | Optional; scoring is deterministic |

---

### 2.2 Domain Application Map

```
backend/apps/
├── users/                  Custom User, StartupProfile, InvestorProfile, TeamMember
├── pitches/                Pitch, PitchAttachment, PitchLike
├── matching/               MatchScore, InvestorIntentSignal
├── offers/                 Offer, real-time WebSocket bid consumer
├── dataroom/               DataRoomDocument, DataRoomAccess (NDA-gated, slide logs)
├── newsfeed/               Activity feed with real-time signals
├── notifications/          Notification, InAppNotification, EmailNotification
├── marketing/              OutreachCampaign, OutreachMessage
├── analytics/              FundraisingPrediction, InvestorBehaviorAnalysis, UserBehaviorEvent
├── intelligence/           11 models + full ML sub-package (§5)
└── predictive_intelligence/  AI provider gateway, capability routing, usage metering
```

---

### 2.3 Intelligence App — Model Taxonomy

| Pillar | Model | Purpose |
| :--- | :--- | :--- |
| Forensic Underwriting | `PitchDeckForensicAnalysis` | Stage-aware deck scoring, unit economics audit, IC thesis |
| Multi-Agent AI | `StartupSuccessPrediction` | Multi-agent debate → dimension scores |
| IC Memo | `DueDiligenceReport` | Bull vs Bear transcript, final IC memo |
| Stealth Sourcing | `StealthFounderSignal` | Registry sweep (CAC / Companies House / Delaware) |
| Institutional Memory | `InstitutionalMemoryEntry` | RAG with vector embeddings |
| Voice Screening | `VoiceInterviewSession` | 15-min autonomous screening + debrief scorecard |
| B2B Licensing | `EnterpriseTenant`, `TenantAPIKey`, `TenantUsageLog` | Multi-tenant API metering |
| Evidence Audit | `VentureOutcomeRecord`, `EvidenceClaimRecord` | Claim-level audit trail |
| Feedback Loop | `PredictionFeedback`, `ModelPerformanceTracker` | Ground-truth capture for retraining |
| Cohorts | `Cohort`, `CohortApplication`, `ICMemoVote` | Accelerator cohort management |

---

### 2.4 API Endpoint Contract

| App | Route | Method | Purpose |
| :--- | :--- | :--- | :--- |
| **auth** | `/api/v1/users/auth/login/` | POST | JWT Login |
| | `/api/v1/users/auth/register/` | POST | Register |
| | `/api/v1/users/auth/refresh/` | POST | Rotate Access Token |
| | `/api/v1/users/profile/me/` | GET/PATCH | Current User Profile |
| **pitches** | `/api/v1/pitches/` | GET/POST | List & Create |
| | `/api/v1/pitches/<id>/` | GET/PUT/DELETE | Detail & CRUD |
| **matching** | `/api/v1/matching/top/` | GET | Top Matches |
| | `/api/v1/matching/refresh/` | POST | Recalculate Scores |
| **offers** | `/api/v1/offers/` | GET/POST | Investment Offers |
| **dataroom** | `/api/v1/dataroom/` | GET/POST | Document Upload |
| | `/api/v1/dataroom/<id>/grant/` | POST | NDA + Access Grant |
| **analytics** | `/api/v1/analytics/predict/` | POST | Fundraising Readiness Score |
| | `/api/v1/analytics/behavior/` | POST | Investor Heatmap Telemetry |
| **intelligence** | `/api/v1/intelligence/forensics/deck/upload/` | POST | Deck Underwriting |
| | `/api/v1/intelligence/forensics/deck/` | POST | Text-based Analysis |
| | `/api/v1/intelligence/due-diligence/` | POST | Multi-Agent IC Memo |
| | `/api/v1/intelligence/due-diligence/<id>/debate/` | POST | Bull vs Bear Debate |
| | `/api/v1/intelligence/brain/query/` | POST | RAG Memory Query |
| | `/api/v1/intelligence/brain/ingest/` | POST | Ingest to Memory |
| | `/api/v1/intelligence/stealth/signals/` | GET | Stealth Founder Signals |
| | `/api/v1/intelligence/stealth/discover/` | POST | Registry Sweep |
| | `/api/v1/intelligence/voice/start/` | POST | Start Voice Session |
| | `/api/v1/intelligence/voice/<id>/turn/` | POST | Submit Transcript Turn |
| | `/api/v1/intelligence/voice/<id>/debrief/` | POST | Debrief Scorecard |
| | `/api/v1/intelligence/tenants/` | GET/POST | Enterprise Tenants |
| | `/api/v1/intelligence/tenants/<id>/keys/` | POST | Provision API Key |
| | `/api/v1/intelligence/webhook/triage/` | POST | Partner Triage Webhook |

---

## 3. Frontend — Next.js 14 App Router

### 3.1 Route Structure

```
src/app/
├── layout.tsx                      Root Layout
├── page.tsx                        Landing page
├── not-found.tsx                   Custom 404
├── providers.tsx                   Context provider tree
│
├── (auth)/                         Auth group (MarketingShell)
│   ├── sign-in/page.tsx
│   ├── sign-up/[role]/page.tsx
│   └── verify/[token]/page.tsx
│
├── (dashboard)/                    Protected group (Sidebar + Navbar)
│   ├── layout.tsx
│   ├── newsfeed/           discover/         pitches/
│   ├── pitches/new/        pitches/[id]/     pitches/[id]/edit/
│   ├── offers/             messages/         dataroom/
│   ├── campaigns/          notifications/    analytics/
│   ├── intelligence/       fundability/      accelerator/
│   ├── admin/              settings/         upgrade/
│   ├── company/            profile/edit/
│   └── profile/avatar/     profile/logo/
│
└── api/auth/                       Next.js BFF (httpOnly cookie management)
    ├── login/route.ts
    ├── logout/route.ts
    ├── refresh/route.ts
    ├── register/route.ts
    └── verify/route.ts
```

### 3.2 Key Library Modules

| Module | Purpose |
| :--- | :--- |
| `src/lib/api.ts` | Axios client — attaches JWT, handles 401 refresh loops |
| `src/lib/intelligenceApi.ts` | Typed intelligence endpoints + TypeScript interfaces |
| `src/lib/validators.ts` | Zod schemas (SignIn, SignUp, Pitch) |
| `src/lib/types.ts` | Shared TypeScript types |
| `src/hooks/useAuth.tsx` | Auth context: login, logout, refresh, session state |
| `src/hooks/useNewsfeed.ts` | Paginated newsfeed with infinite scroll |
| `src/hooks/useNotifications.ts` | Real-time notification subscription |
| `src/hooks/useInfiniteScroll.ts` | Intersection Observer scroll hook |

### 3.3 Component Library

```
src/components/
├── ui/           Button  Card  Badge  Input  Label  Separator
│                 Sheet   DropdownMenu  Logo   Avatar  Textarea  Tooltip
├── layout/       Sidebar  Navbar  DashboardShell  MarketingShell  Footer
├── analytics/    SuccessPredictorDashboard  InvestorROIDashboard  InvestmentHeatmap
├── pitches/      LikeButton
├── newsfeed/     PitchCard
└── offers/       OfferRow  BidPanel
```

---

## 4. ML Service — Standalone FastAPI Microservice

The ML service (`ml/`) runs as a **separate Docker container** with its own FastAPI app, Redis cache, and Prometheus metrics endpoint. Django calls it for real-time predictions; it can also be called directly by authorised B2B clients.

```
ml/
├── main.py                  FastAPI entry-point
├── predictor.py             Core 30-feature prediction orchestrator
├── api/
│   └── app.py               Application factory (rate limiter, metrics middleware)
├── config/
│   └── settings.py          Pydantic-settings (env-var driven)
├── models/
│   ├── registry.py          Versioned model registry (atomic JSON persistence)
│   └── trainer.py           XGBoost training pipeline
├── cache/
│   └── redis_cache.py       Two-tier cache (Redis + in-process LRU)
├── monitoring/
│   ├── metrics.py           Prometheus singletons
│   └── drift.py             Feature drift detection
└── security/
    ├── auth.py              JWT auth + RBAC FastAPI dependencies
    └── rate_limiter.py      Sliding-window rate limiter
```

### 4.1 30-Feature Prediction Schema

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

All features are normalised to `[0, 1]` with per-feature caps before inference.

### 4.2 XGBoost Model + Heuristic Fallback

- **Primary**: XGBoost booster loaded from `MODEL_PATH/startup_success.xgb`
- **Fallback**: Weighted heuristic — 17 calibrated per-feature weights, output range `[0.1, 0.9]`
- Hot-reload via background file-watcher (checks every 5 min) without container restart

Each prediction returns:

| Field | Description |
| :--- | :--- |
| `success_probability` | Point estimate `[0, 1]` |
| `confidence_lower/upper` | Uncertainty-aware interval (widens near 0.5) |
| `roi` | Expected / conservative / optimistic investment multiple + USD return |
| `exit_prediction` | Exit type (IPO / Acquisition / Acqui-hire / Wind-down) + years estimate |
| `shap_top_features` | Top 5 SHAP contributions (XGBoost) or heuristic drivers (fallback) |
| `latency_ms` | End-to-end prediction latency |
| `request_id` | Unique trace ID |
| `model_version` | Active model identifier |

### 4.3 Circuit Breaker

Three-state circuit breaker wraps every XGBoost inference call:

| State | Behaviour |
| :--- | :--- |
| `CLOSED` | Normal inference; tracks failure count |
| `OPEN` | Opened after N failures; all calls route to heuristic fallback |
| `HALF_OPEN` | One probe after timeout; success closes, failure reopens |

Config: `CIRCUIT_BREAKER_THRESHOLD` (default 5), `CIRCUIT_BREAKER_TIMEOUT` (default 60s).

### 4.4 ML API Endpoints

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/health` | GET | Liveness + model status |
| `/ready` | GET | Kubernetes readiness probe |
| `/metrics` | GET | Prometheus text exposition |
| `/predict/success` | POST | Single startup prediction |
| `/predict/batch` | POST | Parallel batch (up to 100, ThreadPoolExecutor) |
| `/predict/embedding` | POST | Sentence-transformer vector embedding |
| `/model/info` | GET | Feature schema + active version + registry |
| `/model/reload` | POST | Hot-reload model from disk |
| `/api/v1/models/activate` | POST | Activate a registry version (admin only) |
| `/api/v1/models/{version}` | DELETE | Remove a model version (admin only) |
| `/api/v1/predict/embedding` | POST | Embedding (app factory variant) |

---

## 5. ML Algorithms — Intelligence Sub-Package

The `backend/apps/intelligence/ml/` sub-package provides **five deterministic ML engines**. All algorithms produce auditable, explainable outputs with no dependency on LLMs.

---

### 5.1 Bayesian Update Engine (`ml/bayesian.py`)

**Algorithm**: Beta-Binomial conjugate updating with credible interval approximation.

Replaces static single-point probability estimates with full **posterior distributions**, updated incrementally as verified evidence arrives.

**Stage Priors (α, β)**:

| Stage | α | β | Baseline P |
| :--- | :--- | :--- | :--- |
| Pre-seed | 2.0 | 18.0 | ~10% |
| Seed | 3.0 | 12.0 | ~20% |
| Series A | 5.0 | 10.0 | ~33% |
| Series B | 6.0 | 6.0 | ~50% |

**Sector Volatility Multipliers** — scales priors to reflect market risk:

| Sector | Multiplier | Effect |
| :--- | :--- | :--- |
| consumer | 1.5× | Widest uncertainty — highest variance |
| climate_hardware | 1.4× | Hardware + policy risk |
| ai_infrastructure | 1.3× | Rapid landscape shifts |
| healthtech | 1.2× | Regulatory uncertainty |
| fintech | 1.1× | Moderate regulatory exposure |
| enterprise_saas | 1.0× | Baseline — most predictable |

**Outputs**:
- `posterior_probability` — updated point estimate
- `credible_interval_5 / 50 / 95` — 5th / median / 95th percentile via Normal approximation of Beta(α, β)
- `uncertainty_score` — Beta variance × 100 (higher = less confident)
- `update_history` — full audit trail of every sequential belief update

---

### 5.2 Anomaly Detection Engine (`ml/anomalies.py`)

**Algorithm**: Percentile-based statistical outlier detection against empirical sector benchmarks.

Audits every claimed metric against sector-specific distributions. Claims beyond P95 trigger verification flags; claims beyond 200% of P95 are `HIGH` severity.

**Benchmark example — `enterprise_saas`**:

| Metric | P25 | Median | P75 | P95 |
| :--- | :--- | :--- | :--- | :--- |
| MoM growth % | 8 | 15 | 25 | 50 |
| Gross margin % | 65 | 78 | 85 | 92 |
| Net revenue retention % | 95 | 110 | 125 | 150 |
| CAC payback months | 6 | 12 | 18 | 24 |

**Severity tiers**:

| Condition | Severity | Action |
| :--- | :--- | :--- |
| Value ≤ P95 | LOW | Within normal range |
| P95 < value ≤ 2×P95 | MEDIUM | Secondary documentation required |
| Value > 2×P95 | HIGH | High verification priority |

---

### 5.3 Venture Outcome Predictor (`ml/outcomes.py`)

**Algorithm**: Multi-task probabilistic prediction combining Bayesian updating + Weibull survival + anomaly audit.

Jointly predicts **five venture milestones** in a single pass:

| Milestone | Typical range |
| :--- | :--- |
| Series A in 18 months | 5% – 95% |
| Series B in 36 months | 3% – 90% |
| $10M ARR in 5 years | 2% – 85% |
| $100M valuation in 5 years | 1.5% – 75% |
| Unicorn ($1B) probability | 0.5% – 25% |

Unicorn probability uses a **long-tail power law** calibrated to real-world VC base rates — capped at 25% to prevent overconfident outlier predictions.

**Output fields**:
- All five milestone probabilities
- `confidence_tier`: `VERY_HIGH` / `HIGH` / `MODERATE` / `SPECULATIVE`
- `primary_positive_drivers` — top explainability factors
- `primary_uncertainty_drivers` — what limits confidence
- Full `bayesian_belief` object with credible intervals
- `survival_curve` — Weibull curve across 7 time horizons
- `anomaly_audit_reports` — any flagged metric outliers
- `evidence_coverage_percentage` — % of claims with verified backing

---

### 5.4 Survival Analysis Engine (`ml/survival.py`)

**Algorithm**: Parametric Weibull hazard model for time-to-fundraising survival curves.

```
F(t) = 1 − exp( −(t / λ)^k )
```

Where:
- `λ` (scale) is adjusted by **traction velocity** — faster-growing companies raise sooner
- `k` (shape) > 1 = increasing hazard as runway burns (`k=1.35` when runway < 12 months, `k=1.15` otherwise)

**Horizons computed**: 3, 6, 9, 12, 18, 24, 36 months

**Output per horizon**:
- `probability_milestone_achieved` — % chance of closing a round by this point
- `hazard_rate` — instantaneous hazard `h(t) = (k/λ) × (t/λ)^(k−1)`

---

### 5.5 Behavioral Sequence Model (`ml/sequences.py`)

**Algorithm**: Markov transition journey scoring for investor intent inference.

Evaluates investor engagement sequences across the full funnel to predict conversion intent and surface the optimal next action.

**Funnel stages with conviction weights**:

| Stage | Weight |
| :--- | :--- |
| VIEW_PROFILE | 5.0 |
| VIEW_PITCH | 10.0 |
| DOWNLOAD_DECK | 25.0 |
| VIEW_DATAROOM | 45.0 |
| RETURN_VISIT | 60.0 |
| REQUEST_INTRO | 80.0 |
| SUBMIT_OFFER | 100.0 |

**Velocity factor**: Events within < 7 days earn up to 1.3× conviction multiplier — compressed engagement signals high conviction.

**Intent tiers**:

| Score | Tier | Recommended Action |
| :--- | :--- | :--- |
| ≥ 80 | IMMINENT_TERM_SHEET | Prepare partner IC memo + cap table model |
| ≥ 55 | HIGH_CONVICTION | Schedule partner deep-dive diligence call |
| ≥ 30 | WARM | Send updated traction snapshot + references |
| < 30 | COLD | Monitor signals, automated newsletter |

---

### 5.6 Historical Time Machine (`ml/time_machine.py`)

**Algorithm**: Point-in-time temporal filtering + Brier Score calibration evaluator.

Prevents **look-ahead bias** in backtesting. Enforces strict temporal filtering — any observation after the evaluation timestamp is dropped before scoring.

**Calibration metrics produced**:

| Metric | Formula | Interpretation |
| :--- | :--- | :--- |
| `brier_score_calibration` | `(1/n) × Σ(pred − actual)²` | 0.0 = perfect calibration |
| `precision_at_top_quartile` | Actual successes in top 25% of ranked predictions | Higher = better ranking |
| `precision_at_top_half` | Actual successes in top 50% | Higher = better ranking |
| `pr_auc` | Approximated from Brier score | Proxy for discrimination ability |
| `leakage_check_passed` | Always `True` when temporal filter applied | Data integrity guarantee |

---

## 6. ML Security Layer

### 6.1 Rate Limiter (`ml/security/rate_limiter.py`)

**Algorithm**: Sliding-window with atomic Redis Lua script eliminating TOCTOU races.

**Redis backend** — single Lua script per request:
```
ZREMRANGEBYSCORE  →  evict expired timestamps
ZCARD             →  count current window
ZADD              →  record new request (if allowed)
EXPIRE            →  reset TTL
```
All four operations execute atomically — no race condition possible across concurrent workers.

**Memory fallback** — `threading.Lock`-protected `defaultdict` with a background eviction daemon (runs every 120s by default).

**Additional features**:
- Weighted requests (`weight=N` for batch endpoints)
- Fail-open on Redis outage — never blocks traffic on infrastructure failure
- `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers
- `reset(client_id)` method for admin / test use

### 6.2 JWT Auth + RBAC (`ml/security/auth.py`)

- **Algorithm**: HS256 JWT (PyJWT ≥ 2.x) — tokens issued by Django, verified independently in ML service
- `create_access_token()` — issues `sub`, `role`, `iat`, `exp` claims
- `verify_token()` — raises `HTTPException(401)` on expiry or invalid signature; never returns `None` silently
- `hash_password()` / `verify_password()` — bcrypt with 12 rounds
- FastAPI `Depends` chain: `get_current_user` → `require_auth` → `require_admin`

---

## 7. Authentication & Core Data Flows

### 7.1 Login Flow

```
Browser → POST /api/auth/login
       → Next.js BFF → POST /api/v1/users/auth/login/ (Django)
       → Django validates (Argon2) → returns {access_token, refresh_token}
       → BFF sets httpOnly cookies
       → Browser sends Bearer token on all subsequent API calls
```

### 7.2 Pitch Deck Forensic Underwriting Flow

```
Frontend → POST /forensics/deck/upload/ {file, stage, sector}
         → deck_parser.py: extract PPTX/PDF → NormalisedDeck
           (slides, claims, metrics, math integrity checks, FX normalisation)
         → forensics.py: 8-dimension dynamic scoring engine
           → BayesianUpdateEngine.update_belief(stage, sector, evidence)
           → AnomalyDetectionEngine.audit_metric(claimed_metrics)
           → VentureOutcomePredictor.predict_venture_outcomes()
           → SurvivalAnalysisEngine.calculate_fundraising_survival_curve()
         → PitchDeckForensicAnalysis.objects.create(...)
         → Response: {fundability_score, bayesian_belief, survival_curve,
                      unicorn_probability, anomaly_reports, score_ledger, ...}
```

### 7.3 ML Prediction Flow

```
Django → PredictionService.predict(startup_data)
       → Cache lookup (Redis → in-process LRU)
         HIT  → return cached result
         MISS → extract_features(30 features, normalised [0,1])
              → CircuitBreaker.protect()
                CLOSED  → XGBoost.predict(DMatrix) → probability
                OPEN    → heuristic_predict(weighted_sum) → probability
              → simulate_roi(prob)        ← single inference pass, prob reused
              → predict_exit(prob)        ← no second inference
              → top_shap_features()       ← SHAP contribs or heuristic drivers
              → Cache.set(result, ttl=300s)
              → Prometheus counter + latency histogram
       → return {success_probability, confidence_interval, roi,
                 exit_prediction, shap_top_features, latency_ms, request_id}
```

---

## 8. Real-Time & Async Infrastructure

**Redis roles**:
- `DB0` — Response cache & session store
- `DB1` — Celery task broker
- `DB2` — Celery result backend
- Channel layer — WebSocket pub/sub (Django Channels)

**Real-time use cases**:
- Live notification delivery to connected investors
- Real-time matching score updates after profile edits
- Voice screening session turn streaming
- Live pitch activity feed updates

---

## 9. Security Architecture

| Layer | Mechanism |
| :--- | :--- |
| **Auth** | JWT Access Tokens (15 min TTL) + httpOnly Refresh Cookies (7 day TTL) |
| **Password Hashing** | Argon2 (primary) → PBKDF2 → BCrypt (fallback chain) |
| **ML Auth** | HS256 JWT verified in ML service; `require_admin` RBAC for destructive ops |
| **Rate Limiting** | Sliding-window per-IP (atomic Redis Lua; thread-safe memory fallback; fail-open) |
| **Circuit Breaker** | CLOSED / OPEN / HALF_OPEN wraps every XGBoost inference call |
| **API Authorization** | `IsAuthenticated` default; `AllowAny` only on webhook & upload endpoints |
| **CORS** | Strict origin allowlist; `CORS_ALLOW_CREDENTIALS = True` |
| **Token Blacklist** | `simplejwt.token_blacklist` tracks invalidated refresh tokens |
| **Data Isolation** | All queries scoped to `request.user`; no cross-tenant leakage |
| **File Validation** | MIME type + extension check before deck parse |
| **B2B API Keys** | Bcrypt-hashed key storage; prefix-based fast lookup; provisioning audit logs |
| **ML API Key** | `X-ML-API-Key` header guard (configurable; disabled by default in dev) |

---

## 10. Deployment Topology

```
CDN / Vercel Edge  (Next.js static assets)
         |
Nginx Reverse Proxy  (SSL termination)
         |
         +-----> Next.js Production  (Node 20 cluster)
         |
         +-----> Django ASGI  (Uvicorn × 4 workers)
         |                |
         |                +----> PostgreSQL 16 (RDS / Supabase)
         |                +----> Redis 7 (ElastiCache)
         |                +----> S3 / Object Storage (decks, documents)
         |                +----> Celery Workers (Docker)
         |                           |
         |                           +----> Email (SES / Sendgrid)
         |
         +-----> FastAPI ML Service  (Uvicorn, Docker)
                         |
                         +----> Redis 7 (prediction cache)
                         +----> Model artefacts (S3 or EFS)
```

---

## 11. Platform Capabilities Summary

| Feature | Status | Key Technology |
| :--- | :--- | :--- |
| Startup & Investor profiles | Live | Django users app, Next.js profile pages |
| Pitch creation & management | Live | pitches app, S3 file storage |
| AI-powered investor matching | Live | matching app, MatchScore model |
| Investment offers & negotiation | Live | offers app, WebSocket bid consumer |
| NDA-gated secure data room | Live | dataroom app, signed NDA flow, slide logs |
| Activity newsfeed | Live | newsfeed app, real-time WebSocket |
| Smart outreach campaigns | Live | marketing app, Celery async sends |
| Fundraising analytics dashboard | Live | analytics app, prediction engine |
| Forensic pitch deck underwriting | Live | intelligence/forensics.py, deck_parser.py |
| **Bayesian belief updating** | Live | BayesianUpdateEngine — Beta-Binomial conjugate |
| **Anomaly detection** | Live | AnomalyDetectionEngine — percentile benchmarks |
| **Multi-task outcome prediction** | Live | VentureOutcomePredictor — 5 milestone heads |
| **Weibull survival analysis** | Live | SurvivalAnalysisEngine — 7 fundraising horizons |
| **Investor behavioral sequences** | Live | BehavioralSequenceModel — Markov intent scoring |
| **Historical time machine** | Live | HistoricalTimeMachine — Brier / leakage-free backtest |
| **XGBoost prediction service** | Live | ml/predictor.py — 30 features, circuit breaker, SHAP |
| **Sliding-window rate limiter** | Live | ml/security/rate_limiter.py — atomic Redis Lua |
| **JWT RBAC (ML service)** | Live | ml/security/auth.py — HS256, bcrypt, Depends chain |
| Institutional memory (RAG Brain) | Live | InstitutionalMemoryEntry + embeddings |
| Stealth founder radar | Live | StealthFounderSignal, registry sweep |
| Autonomous voice screening | Live | VoiceInterviewSession |
| B2B enterprise licensing & API | Live | EnterpriseTenant, TenantAPIKey metering |
| Real-time notifications | Live | Django Channels + Redis |
| Accelerator cohort management | Live | Cohort, CohortApplication, ICMemoVote |

---

## 12. Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16+ (or SQLite for local dev)
- Redis 7+

### Backend Setup

```bash
cd backend
python -m venv venv
# Linux/macOS:
source venv/bin/activate
# Windows:
venv\Scripts\activate

pip install -r requirements.txt
cp ../.env.example ../.env    # populate your local secrets
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### Celery Worker

```bash
cd backend
celery -A config worker --loglevel=info
```

### ML Service

```bash
cd ml
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
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
| ML Service | `http://localhost:8001` |
| API Docs (Django) | `http://localhost:8000/api/docs/` |
| API Docs (ML) | `http://localhost:8001/docs` |
| ML Metrics | `http://localhost:8001/metrics` |

---

## 13. Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SECRET_KEY` | Django cryptographic signing key | Required |
| `DATABASE_URL` | PostgreSQL connection string | `sqlite:///db.sqlite3` |
| `REDIS_URL` | Redis URL (cache, channels, broker) | `redis://127.0.0.1:6379/0` |
| `CELERY_BROKER_URL` | Celery task broker | `redis://localhost:6379/1` |
| `OPENAI_API_KEY` | OpenAI API key (optional) | `""` |
| `GOOGLE_GEMINI_API_KEY` | Google Gemini key (optional) | `""` |
| `NEXT_PUBLIC_API_URL` | Backend base URL for Next.js | `http://localhost:8000` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins | `http://localhost:3000` |
| `MODEL_PATH` | ML service model artefacts directory | `/app/models` |
| `ML_API_KEY` | Static ML API key guard (leave blank to disable) | `""` |
| `JWT_SECRET_KEY` | HS256 signing secret for ML service | Required in prod |
| `CIRCUIT_BREAKER_THRESHOLD` | Failures before circuit opens | `5` |
| `CIRCUIT_BREAKER_TIMEOUT` | Seconds before half-open probe | `60` |
| `ENABLE_CACHE` | Toggle prediction caching | `true` |
| `CACHE_TTL_SECONDS` | Prediction cache TTL | `300` |
| `MAX_BATCH_SIZE` | Max items per batch prediction | `100` |
| `RATE_LIMIT_REQUESTS` | Requests per rate-limit window | `100` |
| `RATE_LIMIT_PERIOD_SECONDS` | Rate-limit window length | `60` |

---

## 14. Quality & Verification

```bash
# Backend tests
cd backend && pytest

# ML service tests
cd ml && pytest tests/

# Frontend TypeScript check
cd frontend && npx tsc --noEmit

# Frontend production build
cd frontend && npm run build
```

---

## License

Proprietary. All rights reserved.
