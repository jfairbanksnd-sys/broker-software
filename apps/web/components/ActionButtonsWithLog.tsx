"use client";

import { ActionButtons } from "@broker/ui";
import { addContactLogEntry } from "../lib/actionStateStore";

type Props = {
  loadId: string;
  phone: string | null;
  originLabel: string;
  destinationLabel: string;
};

function methodFromHref(href: string): "CALL" | "TEXT" | "MAP" | null {
  const h = href.toLowerCase();
  if (h.startsWith("tel:")) return "CALL";
  if (h.startsWith("sms:")) return "TEXT";
  if (h.includes("maps") || h.startsWith("geo:")) return "MAP";
  return null;
}

export default function ActionButtonsWithLog({ loadId, phone, originLabel, destinationLabel }: Props) {
  return (
    <div
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        const a = target?.closest("a") as HTMLAnchorElement | null;
        const href = a?.getAttribute("href");
        if (!href) return;

        const method = methodFromHref(href);
        if (!method) return;

        addContactLogEntry({
          actionId: `${loadId}__DETAILS_CTA`,
          loadId,
          method,
          atISO: new Date().toISOString(),
        });
        // DO NOT preventDefault — we want the tel:/sms:/maps action to execute normally.
      }}
    >
      <ActionButtons phone={phone} originLabel={originLabel} destinationLabel={destinationLabel} />
    </div>
  );
}
