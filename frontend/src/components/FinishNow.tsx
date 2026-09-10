import React, { useEffect, useState } from "react";
import { Pressable } from "react-native";

import { FINISH_RATES, type JobDto, usePremiumMutations } from "@/src/api/hooks";
import { useToast } from "@/src/components/overlay";
import { Icon, T } from "@/src/components/ui";
import { formatNumber, useI18n } from "@/src/i18n";
import { serverNow } from "@/src/api/client";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  btn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
}));

const FORBIDDEN_UNITS = new Set(["Carro di Conquista", "Drago", "Angelo", "Demone", "Unicorno"]);

/** "Completa ora · ◆N" pill for a running job (Bible §23). Client-side price preview from spec rates (server re-quotes and
 * enforces the competitive lock). Hidden for non-finishable kinds and forbidden units. */
export function FinishNowButton({ job }: { job: JobDto }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { worldId, rubies } = useGame();
  const mm = usePremiumMutations(worldId ?? "");
  const { show, showError } = useToast();
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, []);
  const rate = FINISH_RATES[job.kind];
  if (!rate || job.status !== "RUNNING" || (job.kind === "RECRUIT" && FORBIDDEN_UNITS.has(job.target ?? ""))) return null;
  const mins = Math.max(0, Math.ceil((Date.parse(job.ends_at) - now) / 60000));
  const price = Math.max(rate.min, Math.ceil(mins * rate.perMinute));
  const affordable = rubies >= price;
  return (
    <Pressable
      style={[s.btn, !affordable && { opacity: 0.55 }]}
      disabled={mm.finish.isPending}
      onPress={() =>
        mm.finish
          .mutateAsync(job.job_id)
          .then((r) => show(`${t("finished")} · −${formatNumber(r.price_rubies)} ${t("rubies")}`, "success"))
          .catch(showError)
      }
      accessibilityLabel={`${t("finishNow")} ${price} ${t("rubies")}`}
      testID={`job-${job.job_id}-finish`}
    >
      <Icon name="fast-forward" size={14} color={colors.brandPrimary} />
      <T v="caption" style={{ color: colors.onSurface, fontWeight: "700" }}>
        {formatNumber(price)}
      </T>
      <Icon name="diamond" size={12} color={colors.brandPrimary} />
    </Pressable>
  );
}
