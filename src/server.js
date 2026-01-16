import { ENV } from "./config/env.js";
import { connectMongo } from "./infra/mongo.js";
import { app } from "./app.js";

async function main() {
  await connectMongo();
  app.listen(ENV.port, () => {
    console.log(`✅ Server listening on http://localhost:${ENV.port}`);
  });
}
main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
