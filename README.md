# Don't Break The Chain 🔗

> Build powerful daily habits using the Seinfeld productivity method.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router) + TailwindCSS + Framer Motion |
| Backend | Node.js / Express + TypeScript |
| Database | PostgreSQL |
| Auth | JWT stored in httpOnly cookies |
| Deploy | Docker Compose (backend + DB) + Vercel (frontend) |

---

## Quick Start (Local Dev)

### 1. Start the database + backend

```bash
# Copy and edit env (set a strong JWT_SECRET)
cp backend/.env.example backend/.env

# Start postgres + backend via Docker
docker-compose up --build
```

Backend is now available at `http://localhost:4000`

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is now available at `http://localhost:3000`

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Secret for signing JWTs (**change this!**) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |
| `NODE_ENV` | `development` | `production` enables Secure cookies |

### Frontend (`frontend/.env.local`)
| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend API base URL |

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Login, sets JWT cookie |
| POST | `/auth/logout` | — | Clears cookie |
| GET | `/auth/me` | — | Session check |
| GET | `/habits` | ✓ | List habits with streaks |
| POST | `/habits` | ✓ | Create habit |
| DELETE | `/habits/:id` | ✓ | Delete habit |
| POST | `/habits/:id/checkin` | ✓ | Toggle today's completion |

---

## Deployment

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. Import into Vercel
3. Set `NEXT_PUBLIC_API_URL` to your VPS backend URL

### Backend → VPS
```bash
JWT_SECRET=your_secret_here CORS_ORIGIN=https://your-vercel-url.app docker-compose up -d
```
