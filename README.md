# IdeaArena Pro 🚀

IdeaArena is upgraded to a real full-stack app:
- React + Vite frontend
- Node.js + Express backend
- MongoDB / MongoDB Atlas database
- JWT authentication with secure password hashing
- Welcome email after signup
- Password reset email via SMTP
- User profile/name shown across the UI
- Ideas, voting, comments and leaderboard APIs

## Run locally
1. `cp .env.example .env`
2. Fill `MONGODB_URI`, `JWT_SECRET`, and SMTP values.
3. `npm install`
4. `npm run dev`
5. Open `http://localhost:5173`

MongoDB can be local or MongoDB Atlas. For Gmail SMTP, create a Google App Password and put it in `SMTP_PASS`.

## Production
`npm run build` then `npm start`. The Express server serves the built React app and API from the same server.
