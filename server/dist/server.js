import dotenv from 'dotenv';
import express from 'express';
import basicRoutes from './routes/index';
import authRoutes from './routes/authRoutes';
import positionRoutes from './routes/positionRoutes';
import tradeRoutes from './routes/tradeRoutes';
import botRoutes from './routes/botRoutes';
import { connectDB } from './config/database';
import cors from 'cors';
// Load environment variables
dotenv.config();
if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL variables in .env missing.");
    process.exit(-1);
}
const app = express();
const port = process.env.PORT || 3000;
// Pretty-print JSON responses
app.enable('json spaces');
// We want to be consistent with URL paths, so we enable strict routing
app.enable('strict routing');
app.use(cors({}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Database connection
connectDB();
app.on("error", (error) => {
    console.error(`Server error: ${error.message}`);
    console.error(error.stack);
});
// Basic Routes
app.use(basicRoutes);
// Authentication Routes
app.use('/api/auth', authRoutes);
// Position Routes
app.use('/api/positions', positionRoutes);
// Trade Routes
app.use('/api/trades', tradeRoutes);
// Bot Routes
app.use('/api/bot', botRoutes);
// If no routes handled the request, it's a 404
app.use((req, res) => {
    res.status(404).send("Page not found.");
});
// Error handling
app.use((err, req, res) => {
    console.error(`Unhandled application error: ${err.message}`);
    console.error(err.stack);
    res.status(500).send("There was an error serving your request.");
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
//# sourceMappingURL=server.js.map