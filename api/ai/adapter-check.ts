import { createVercelHandler } from "../../server/vercel-adapter";

export default createVercelHandler({
  GET: async () => Response.json({ adapter: "ok" }),
});
