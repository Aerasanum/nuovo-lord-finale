import React, { memo } from "react";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";

import type { CrestDto } from "@/src/api/hooks";

/**
 * Casata crest (Bible §40.4): shield base → secondary mark → primary symbol → border. Pure vector, colours from the
 * heraldic content palette carried by the DTO (not the UI theme, so a crest looks identical to every player).
 */
export const Crest = memo(function Crest({ crest, size = 40, testID }: { crest: CrestDto; size?: number; testID?: string }) {
  const c = crest.colors;
  const strokeW = crest.border === "thick" ? 7 : crest.border === "thin" ? 3.5 : 0;
  const stroke = strokeW ? c.border : "none";
  const base = shieldPath(crest.shield_base);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" testID={testID}>
      <Path d={base} fill={c.base} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" />
      {crest.secondary_mark === "stripe" ? <Path d="M14 74 L74 14 L86 26 L26 86 Z" fill={c.secondary} opacity={0.9} /> : null}
      {crest.secondary_mark === "bar" ? <Rect x={16} y={14} width={68} height={14} fill={c.secondary} /> : null}
      {symbol(crest.primary_symbol, c.primary)}
      {crest.secondary_mark === "dot" ? <Circle cx={72} cy={26} r={7} fill={c.secondary} /> : null}
    </Svg>
  );
});

function shieldPath(base: CrestDto["shield_base"]): string {
  switch (base) {
    case "round":
      return "M50 8 A42 42 0 1 1 49.9 8 Z";
    case "kite":
      return "M50 6 L84 26 L74 66 L50 94 L26 66 L16 26 Z";
    case "square":
      return "M18 12 Q18 8 22 8 L78 8 Q82 8 82 12 L82 78 Q82 88 72 90 L50 94 L28 90 Q18 88 18 78 Z";
    default: // heater
      return "M14 12 L86 12 L86 48 C86 72 68 86 50 94 C32 86 14 72 14 48 Z";
  }
}

function symbol(kind: CrestDto["primary_symbol"], fill: string) {
  switch (kind) {
    case "circle":
      return <Circle cx={50} cy={50} r={20} fill={fill} />;
    case "diamond":
      return <Polygon points="50,26 72,50 50,74 28,50" fill={fill} />;
    case "cross":
      return <Path d="M43 24 H57 V43 H76 V57 H57 V78 H43 V57 H24 V43 H43 Z" fill={fill} />;
    case "star":
      return <Polygon points="50,24 57,42 76,43 61,55 66,74 50,63 34,74 39,55 24,43 43,42" fill={fill} />;
    case "chevron":
      return <Path d="M22 66 L50 30 L78 66 L68 66 L50 44 L32 66 Z" fill={fill} />;
    case "tower":
      return <Path d="M34 74 V36 H40 V30 H46 V36 H54 V30 H60 V36 H66 V74 Z M46 74 V58 H54 V74 Z" fill={fill} fillRule="evenodd" />;
    case "crescent":
      return <Path d="M62 28 A24 24 0 1 0 62 74 A18 18 0 1 1 62 28 Z" fill={fill} />;
    default: // triangle
      return <Polygon points="50,26 74,70 26,70" fill={fill} />;
  }
}
