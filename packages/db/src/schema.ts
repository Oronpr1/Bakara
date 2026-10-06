import { COMMENT_STATUSES, PHASES, ROLES } from "@al/domain";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ROLES);
export const phaseEnum = pgEnum("phase", PHASES);
/** What a reviewer decided: approved, returned for changes, or the decision was cleared. */
export const decisionKindEnum = pgEnum("decision_kind", ["APPROVED", "CHANGES", "CLEARED"]);
export const commentStatusEnum = pgEnum("comment_status", COMMENT_STATUSES);
/** Where a version's PDF came from: the Word add-in, a manual upload, or Graph conversion. */
export const pdfSourceEnum = pgEnum("pdf_source", ["ADDIN", "UPLOAD", "GRAPH"]);
export const seasonStatusEnum = pgEnum("season_status", ["ACTIVE", "ARCHIVED"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(), // stored lower-case
    name: text("name").notNull(),
    roles: roleEnum("roles").array().notNull().default(sql`'{}'`),
    active: boolean("active").notNull().default(true),
    /** scrypt hash set by the control manager; null = the user cannot sign in yet. */
    passwordHash: text("password_hash"),
    passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/** Server-side sessions. The cookie carries a random token; only its hash is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    /** Set when the session was opened from a personal link: it works for this one letter only. */
    linkLetterId: uuid("link_letter_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash)],
);

/**
 * A personal link that lets one academic approver open one letter without a password. Only a
 * hash of the link's secret is stored. A new link for the same person and letter replaces it.
 */
export const academicLinks = pgTable(
  "academic_links",
  {
    id: id(),
    letterId: uuid("letter_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("academic_links_token_uq").on(t.tokenHash), index("academic_links_letter_idx").on(t.letterId, t.userId)],
);

/** A registration season, e.g. תשפ"ז א'. Each season is its own workspace. */
export const seasons = pgTable("seasons", {
  id: id(),
  name: text("name").notNull(),
  status: seasonStatusEnum("status").notNull().default("ACTIVE"),
  /** The season this one was created from ("צור על בסיס עונה קודמת"). */
  sourceSeasonId: uuid("source_season_id"),
  /** Days without a response before an automatic reminder; set by the control manager. */
  reminderIntervalDays: integer("reminder_interval_days").notNull().default(3),
  /** Registration manager first, then the VP (false: both at once). */
  sequentialReview: boolean("sequential_review").notNull().default(true),
  /** The control manager reviews before the registration manager. */
  controlReview: boolean("control_review").notNull().default(false),
  /** The date the letters must be approved by. */
  dueDate: date("due_date"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/**
 * A campus. Its registration manager and advisor are the default for every faculty in it
 * that does not have its own (e.g. Haifa: one registration manager for all faculties).
 */
export const campuses = pgTable("campuses", {
  id: id(),
  name: text("name").notNull().unique(),
  registrationManagerId: uuid("registration_manager_id").references(() => users.id),
  advisorId: uuid("advisor_id").references(() => users.id),
  /** In this campus only the VP reviews: no registration manager is needed. */
  onlyVp: boolean("only_vp").notNull().default(false),
  createdAt: createdAt(),
});

/**
 * A campus + faculty: its own workspace. The registration manager is set once here and is the
 * registration manager of every track in it, in every season.
 */
export const units = pgTable(
  "units",
  {
    id: id(),
    campus: text("campus").notNull(),
    faculty: text("faculty").notNull(),
    registrationManagerId: uuid("registration_manager_id").references(() => users.id),
    /** The control advisor who prepares the letters of this campus + faculty by default. */
    advisorId: uuid("advisor_id").references(() => users.id),
    /** In this faculty only the VP reviews: no registration manager is needed. */
    onlyVp: boolean("only_vp").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("units_campus_faculty_uq").on(t.campus, t.faculty)],
);

/** דרישת מכתב: one acceptance letter to prepare for one track in one season. */
export const letterRequests = pgTable(
  "letter_requests",
  {
    id: id(),
    seasonId: uuid("season_id").notNull().references(() => seasons.id),
    campus: text("campus").notNull(),
    faculty: text("faculty").notNull(),
    trackName: text("track_name").notNull(),
    trackNumber: text("track_number").notNull(),
    advisorId: uuid("advisor_id").notNull().references(() => users.id),
    phase: phaseEnum("phase").notNull().default("DRAFT"),
    /** Set for this track only; otherwise the registration manager comes from the campus + faculty. */
    registrationManagerId: uuid("registration_manager_id").references(() => users.id),
    /** The advisor is mid-fix: set when a reviewer comments or returns the letter, cleared by "שלחתי תיקונים". */
    advisorHold: boolean("advisor_hold").notNull().default(false),
    /** The same track's letter in the season this one was copied from: its approved file is the starting point. */
    sourceLetterId: uuid("source_letter_id"),
    /** When the advisor marked the approved letter as loaded into Gilboa. */
    inGilboaAt: timestamp("in_gilboa_at", { withTimezone: true }),
    dueDate: date("due_date"),
    latestVersion: integer("latest_version").notNull().default(0),
    /** The live working DOCX in SharePoint, once Microsoft 365 is connected. */
    sharepointDriveId: text("sharepoint_drive_id"),
    sharepointItemId: text("sharepoint_item_id"),
    /** The file's web URL; the Word add-in identifies the open letter by it. */
    sharepointWebUrl: text("sharepoint_web_url"),
    /** Content tag of the live file when the last official version was taken from it. */
    sharepointVersionCTag: text("sharepoint_version_ctag"),
    /** Since when the current holder has had the letter (for "waiting N days"). */
    holderSince: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("letter_requests_track_uq").on(t.seasonId, t.campus, t.trackNumber),
    index("letter_requests_season_phase_idx").on(t.seasonId, t.phase),
    index("letter_requests_advisor_idx").on(t.advisorId),
  ],
);

/**
 * Extra people on one track, added by the control manager at her discretion: more advisors
 * (they prepare and fix the letter like the main one) and more managers (they review in the
 * registration manager's seat; any one of them may decide).
 */
export const letterPeople = pgTable(
  "letter_people",
  {
    id: id(),
    letterId: uuid("letter_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: text("kind", { enum: ["ADVISOR", "MANAGER"] }).notNull(),
    addedBy: uuid("added_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("letter_people_letter_idx").on(t.letterId), uniqueIndex("letter_people_once_uq").on(t.letterId, t.userId, t.kind)],
);

/** The academic approvers invited to a letter (each answers through a personal link). */
export const letterAcademics = pgTable(
  "letter_academics",
  {
    id: id(),
    letterId: uuid("letter_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    invitedBy: uuid("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [index("letter_academics_letter_idx").on(t.letterId), uniqueIndex("letter_academics_once_uq").on(t.letterId, t.userId)],
);

/**
 * Review decisions, append-only. A seat ("RM", "VP", "FINAL", "ACADEMIC:<user>"...) is approved,
 * returned or pending according to its last row. CLEARED cancels the one before it.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    letterId: uuid("letter_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
    seat: text("seat").notNull(),
    kind: decisionKindEnum("kind").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** The person whose seat it is, when someone else (the control manager) decided in their place. */
    onBehalfOf: uuid("on_behalf_of").references(() => users.id),
    versionNumber: integer("version_number").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_letter_idx").on(t.letterId, t.createdAt)],
);

/** An official version: a frozen DOCX + PDF pair. Files live in blob storage, keyed here. */
export const versions = pgTable(
  "versions",
  {
    id: id(),
    letterId: uuid("letter_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    docxKey: text("docx_key").notNull(),
    docxSha256: text("docx_sha256").notNull(),
    docxSize: integer("docx_size").notNull(),
    pdfKey: text("pdf_key").notNull(),
    pdfSha256: text("pdf_sha256").notNull(),
    pdfSize: integer("pdf_size").notNull(),
    pageCount: integer("page_count").notNull(),
    /** How much of the Word text also appears in the PDF (0-100); a low number means they may not match. */
    textMatch: integer("text_match"),
    pdfSource: pdfSourceEnum("pdf_source").notNull(),
    sharepointVersionId: text("sharepoint_version_id"),
    note: text("note"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("versions_letter_number_uq").on(t.letterId, t.number)],
);

/** A comment on a marked area of one page of one version's PDF. */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    letterId: uuid("letter_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    page: integer("page").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    /** Image of the marked area at the time of writing, for the "what was here" popup. */
    snapshotKey: text("snapshot_key"),
    body: text("body").notNull(),
    /** "במקום ___ כתבו ___": the wording the reviewer proposes. */
    suggestion: text("suggestion"),
    /** A reviewer's comments stay drafts (seen only by the author) until their decision publishes them. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    status: commentStatusEnum("status").notNull().default("OPEN"),
    statusNote: text("status_note"),
    fixedInVersion: integer("fixed_in_version"),
    statusChangedBy: uuid("status_changed_by").references(() => users.id),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("comments_letter_status_idx").on(t.letterId, t.status)],
);

export const commentReplies = pgTable(
  "comment_replies",
  {
    id: id(),
    commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comment_replies_comment_idx").on(t.commentId, t.createdAt)],
);

/** The control manager's rules: which roles may do each of the bigger things (see domain/policy.ts). */
export const rules = pgTable("rules", {
  capability: text("capability").primaryKey(),
  roles: roleEnum("roles").array().notNull().default(sql`'{}'`),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only history of everything that happened. Never updated or deleted by the app. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id),
    seasonId: uuid("season_id"),
    letterId: uuid("letter_id"),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
  },
  (t) => [index("audit_events_letter_idx").on(t.letterId, t.at)],
);

/** In-app notifications; the email worker sends the ones not yet emailed. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    letterId: uuid("letter_id").references(() => letterRequests.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);
