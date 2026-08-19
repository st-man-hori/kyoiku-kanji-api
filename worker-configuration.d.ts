interface __BaseEnv_CloudflareBindings {
	DB: D1Database;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/index");
	}
	interface Env extends __BaseEnv_CloudflareBindings {}
}
interface CloudflareBindings extends __BaseEnv_CloudflareBindings {}
