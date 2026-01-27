import * as React from "react";

type Props = {
  phone?: string | null;
  originLabel?: string | null;
  destinationLabel?: string | null;
  className?: string;
};

function normalizePhone(phone: string) {
  // Keep digits and plus only (works fine for tel: links)
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

function directionsUrl(originLabel?: string | null, destinationLabel?: string | null) {
  const o = originLabel?.trim();
  const d = destinationLabel?.trim();

  if (o && d) {
    const origin = encodeURIComponent(o);
    const destination = encodeURIComponent(d);
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  }

  const q = encodeURIComponent((o || d || " ").trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function ActionButtons({ phone, originLabel, destinationLabel, className }: Props) {
  const safePhone = phone ? normalizePhone(phone) : null;

  const telHref = safePhone ? `tel:${safePhone}` : undefined;
  const smsHref = safePhone ? `sms:${safePhone}` : undefined;
  const mapHref = directionsUrl(originLabel ?? null, destinationLabel ?? null);

  const baseBtn =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-black/10 " +
    "bg-white hover:bg-gray-50 active:bg-gray-100 transition";

  const disabledBtn = "opacity-50 pointer-events-none";

  return (
    <div className={["flex flex-wrap gap-2", className].filter(Boolean).join(" ")}>
      <a className={[baseBtn, !telHref ? disabledBtn : ""].join(" ")} href={telHref} aria-disabled={!telHref}>
        Call
      </a>
      <a className={[baseBtn, !smsHref ? disabledBtn : ""].join(" ")} href={smsHref} aria-disabled={!smsHref}>
        Text
      </a>
      <a className={baseBtn} href={mapHref} target="_blank" rel="noreferrer">
        Map
      </a>
    </div>
  );
}
