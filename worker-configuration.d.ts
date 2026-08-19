interface RateLimit {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}
interface __BaseEnv_CloudflareBindings {
	DB: D1Database;
	RATE_LIMITER: RateLimit;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/index");
	}
	interface Env extends __BaseEnv_CloudflareBindings {}
}
interface CloudflareBindings extends __BaseEnv_CloudflareBindings {}
