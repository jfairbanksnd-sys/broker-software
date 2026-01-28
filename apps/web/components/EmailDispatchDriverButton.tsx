"use client";

import { addContactLogEntry } from "../lib/actionStateStore";

type Props = {
  loadId: string;

  // optional - can be missing in mock data
  dispatchEmail?: string | null;
  driverEmail?: string | null;

  // optional context for email body
  subject?: string;
  bodyLines?: string[];
};

function isEmail(v: unknown): v is string {
  return typeof v === "string" && v.includes("@");
}

function buildMailtoHref(args: { to: string; cc?: string; subject: string; body: string }) {
  const params = new URLSearchParams();
  if (args.cc) params.set("cc", args.cc);
  params.set("subject", args.subject);
  params.set("body", args.body);
  return `mailto:${encodeURIComponent(args.to)}?${params.toString()}`;
}

export default function EmailDispatchDriverButton({
  loadId,
  dispatchEmail,
  driverEmail,
  subject,
  bodyLines,
}: Props) {
  const dispatch = isEmail(dispatchEmail) ? dispatchEmail! : undefined;
  const driver = isEmail(driverEmail) ? driverEmail! : undefined;

  const enabled = Boolean(dispatch || driver);

  const to = dispatch ?? driver ?? "";
  const cc = dispatch && driver ? driver : undefined;

  const subj = subject ?? `Load ${loadId} — Update Needed`;
  const body =
    (bodyLines && bodyLines.length ? bodyLines : [`Load: ${loadId}`, "", "Please confirm current status and ETA."])
      .filter(Boolean)
      .join("\n");

  const href = enabled ? buildMailtoHref({ to, cc, subject: subj, body }) : undefined;

  return enabled ? (
    <a
      href={href}
      onClick={() => {
        addContactLogEntry({
          actionId: `${loadId}__DETAILS_EMAIL`,
          loadId,
          method: "EMAIL",
          atISO: new Date().toISOString(),
        });
        // do NOT preventDefault — mailto should open normally
      }}
      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
    >
      Email dispatch/driver
    </a>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-300">
      Email dispatch/driver
    </span>
  );
}
