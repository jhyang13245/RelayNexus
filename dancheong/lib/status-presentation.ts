import type {
  PublicStatusItem,
  PublicStatusRelation,
  PublicStatusSnapshot,
} from "./scenario";

export type CompactStatusItem = Pick<
  PublicStatusItem,
  "id" | "kind" | "delta"
> & {
  label: string;
  displayValue: string;
};

export type CompactStatusRelation = Pick<
  PublicStatusRelation,
  "characterId" | "name" | "trust" | "delta"
> & {
  relationType: string;
};

export type CompactStatusView = {
  items: CompactStatusItem[];
  relations: CompactStatusRelation[];
};

export type DetailedStatusItem = PublicStatusItem & {
  sectionId: string;
  sectionLabel: string;
};

export type DetailedStatusView = {
  ability?: DetailedStatusItem;
  stats: DetailedStatusItem[];
  resources: DetailedStatusItem[];
  condition?: DetailedStatusItem;
  funds?: DetailedStatusItem;
};

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;
const HIDDEN_STATUS_LABEL =
  /objective|goal|mission|quest|plan|schedule|future|next|secret|hidden|identity|true\s*name|contract|master|servant|summon|class|enemy|target|event|clock|목표|임무|퀘스트|계획|예정|미래|다음|비밀|숨김|진명|정체|계약|마스터|서번트|소환|클래스|적군|표적|사건\s*시계/i;

const LABEL_RULES: Array<{
  pattern: RegExp;
  label: string;
  priority: number;
}> = [
  { pattern: /rank|circle|level|realm|경지|등급|레벨|써클/i, label: "경지", priority: 10 },
  { pattern: /affiliation|organization|faction|belong|소속|조직|세력/i, label: "소속", priority: 20 },
  { pattern: /position|occupation|title|job|role|직위|직책|신분|역할/i, label: "직위", priority: 30 },
  { pattern: /condition|injury|wound|status|상태|부상|이상/i, label: "상태", priority: 40 },
  { pattern: /health|hit\s*point|\bhp\b|체력|생명력/i, label: "체력", priority: 42 },
  { pattern: /mana|magic(?:al)?\s*energy|\bmp\b|마나|마력/i, label: "마력", priority: 44 },
  { pattern: /skill|ability|talent|스킬|기술|능력/i, label: "스킬", priority: 50 },
  { pattern: /inventory|possession|belongings|bag|인벤토리|소지품|가방/i, label: "소지품", priority: 60 },
  { pattern: /equipment|weapon|armor|장비|무기|방어구/i, label: "장비", priority: 62 },
  { pattern: /resource|currency|money|funds|gold|자원|재화|소지금/i, label: "자원", priority: 64 },
  { pattern: /intelligence|intellect|지능/i, label: "지능", priority: 70 },
  { pattern: /divinity|divine|holy|신성/i, label: "신성", priority: 72 },
  { pattern: /strength|근력|힘/i, label: "근력", priority: 74 },
  { pattern: /agility|dexterity|speed|민첩|속도/i, label: "민첩", priority: 76 },
  { pattern: /luck|행운/i, label: "행운", priority: 78 },
  { pattern: /reputation|fame|평판|명성/i, label: "평판", priority: 80 },
  { pattern: /alignment|성향/i, label: "성향", priority: 82 },
];

const SIMPLE_VALUE_TRANSLATIONS: Record<string, string> = {
  active: "활동 중",
  critical: "위중",
  empty: "없음",
  false: "없음",
  good: "양호",
  healthy: "양호",
  inactive: "비활성",
  injured: "부상",
  none: "없음",
  normal: "정상",
  poor: "저조",
  stable: "안정",
  true: "있음",
  unknown: "미확인",
};

const RELATION_TRANSLATIONS: Record<string, string> = {
  acquaintance: "지인",
  ally: "동료",
  enemy: "적대",
  friend: "친구",
  friendly: "우호",
  hostile: "적대",
  neutral: "중립",
  rival: "경쟁",
  stranger: "초면",
  suspicious: "의심",
};

const localizeValue = (value: string) =>
  SIMPLE_VALUE_TRANSLATIONS[value.trim().toLowerCase()] ?? value;

const localizeRelationType = (value: string) => {
  if (!value) return "관계 형성 중";
  if (HANGUL.test(value)) return value;
  return RELATION_TRANSLATIONS[value.trim().toLowerCase()] ?? "관계 형성 중";
};

const presentableStatusItem = (
  item: PublicStatusItem,
  sectionLabel: string,
  order: number,
) => {
  const sourceLabel = item.label.trim();
  const searchText = `${item.id} ${sourceLabel} ${sectionLabel}`;
  if (HIDDEN_STATUS_LABEL.test(searchText)) return undefined;

  const rule = LABEL_RULES.find(({ pattern }) => pattern.test(searchText));
  if (!rule && !HANGUL.test(sourceLabel)) return undefined;

  const displayValue = localizeValue(item.displayValue.trim());
  if (!displayValue || displayValue === "-") return undefined;

  return {
    id: item.id,
    kind: item.kind,
    delta: item.delta,
    label: rule?.label ?? sourceLabel,
    displayValue,
    priority: rule?.priority ?? 90,
    order,
  };
};

export const buildCompactStatusView = (
  snapshot: PublicStatusSnapshot,
  maximumItems = 5,
  maximumRelations = 3,
): CompactStatusView => {
  const seenLabels = new Set<string>();
  const items = snapshot.sections
    .flatMap((section, sectionIndex) =>
      section.items.map((item, itemIndex) =>
        presentableStatusItem(
          item,
          section.label,
          sectionIndex * 100 + itemIndex,
        ),
      ),
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.priority - b.priority || a.order - b.order)
    .filter((item) => {
      if (seenLabels.has(item.label)) return false;
      seenLabels.add(item.label);
      return true;
    })
    .slice(0, Math.max(0, maximumItems))
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      delta: item.delta,
      label: item.label,
      displayValue: item.displayValue,
    }));

  const relations = snapshot.relations
    .slice(0, Math.max(0, maximumRelations))
    .map((relation) => ({
      characterId: relation.characterId,
      name: relation.name,
      relationType: localizeRelationType(relation.relationType),
      trust: relation.trust,
      delta: relation.delta,
    }));

  return { items, relations };
};

export const buildDetailedStatusView = (
  snapshot: PublicStatusSnapshot,
): DetailedStatusView => {
  const items = snapshot.sections.flatMap((section, sectionIndex) =>
    section.items.flatMap((item, itemIndex) => {
      const presented = presentableStatusItem(
        item,
        section.label,
        sectionIndex * 100 + itemIndex,
      );
      if (!presented) return [];
      const preserveConfiguredLabel = /^(?:resources?|funds?)$/i.test(
        section.id,
      ) && item.label.trim();
      return [{
        ...item,
        label: preserveConfiguredLabel ? item.label.trim() : presented.label,
        displayValue: presented.displayValue,
        sectionId: section.id,
        sectionLabel: section.label,
      }];
    }),
  );
  const matches = (item: DetailedStatusItem, pattern: RegExp) =>
    pattern.test(`${item.id} ${item.label} ${item.sectionId} ${item.sectionLabel}`);
  const funds = items.find((item) =>
    matches(item, /(?:^|[_\s-])funds?(?:$|[_\s-])|wallet|money|currency|자금|소지금/i)
  );
  const condition = items.find((item) =>
    matches(item, /condition|current[_\s-]*status|상태|부상|이상/i)
  );
  const ability = items.find((item) =>
    matches(item, /ability[_\s-]*summary|\bability\b|skills?|능력\s*설명|공개\s*능력/i)
  );
  const resources = items.filter((item) =>
    item.id !== funds?.id && matches(
      item,
      /resources?|command[_\s-]*seals?|magic[_\s-]*(?:gems?|weapons?)|령주|보석|마술\s*무기/i,
    )
  ).slice(0, 3);
  const occupied = new Set(
    [ability?.id, condition?.id, funds?.id, ...resources.map((item) => item.id)]
      .filter(Boolean),
  );
  const stats = items.filter((item) =>
    !occupied.has(item.id) &&
    item.kind === "number" &&
    (matches(item, /core[_\s-]*stats?|능력치|체력|집중력|게이지|health|focus|gauge/i) ||
      /core[_\s-]*stats?/i.test(item.sectionId))
  ).slice(0, 5);

  return { ability, stats, resources, condition, funds };
};
