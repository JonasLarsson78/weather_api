import 'dotenv/config';
import express from 'express';
import weatherRoutes from './routes/weatherRoutes';

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use('/', weatherRoutes);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});