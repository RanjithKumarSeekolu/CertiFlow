import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app";
import { initSocketIO } from "./realtime/socket";

const port = Number(process.env.PORT) || 8081;

const server = http.createServer(app);
initSocketIO(server);

server.listen(port, () => {
  console.log(`🚀 CertiFlow Server is running on port ${port}`);
  console.log(`🔗 http://localhost:${port}`);
});

export default server;