import type { Actor } from "@al/domain";
import type { SessionUser } from "./auth/service";

/** The workflow rules' view of the signed-in user. */
export const actorOf = (user: SessionUser): Actor => ({ userId: user.id, roles: user.roles });
