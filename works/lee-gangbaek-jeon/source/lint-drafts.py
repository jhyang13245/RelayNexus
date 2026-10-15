# Consistency checks for 이강백전 event drafts (canon reveal timing, protected terms, schema).
import json, sys, glob, os, re

work = sys.argv[1]
drafts = []
for path in sorted(glob.glob(os.path.join(work, "drafts", "ep*.json"))):
    for d in json.load(open(path, encoding="utf-8")):
        drafts.append(d)
drafts.sort(key=lambda d: (int(d["episode"]), int(d["part"])))

protected = ["인피면구", "반로환동", "회(灰)", "묵(墨)", "白 편지", "두 개의 먹"]
# term -> first episode where it may appear in event text (story knowledge, not GM notes)
first_allowed = {
    "진목": 13, "청산검문": 13, "창허": 12, "흑린": 22, "넷째 길": 22, "심마": 22,
    "백발": 12, "이름 없는 자들": 19, "자하신공": 19, "연소운": 18,
    "육문": 24, "하후령": 27, "단엽": 32, "고경": 25, "통혜관": 24,
    "李江白": 23, "마흔한": 23, "41번째": 23, "강백 씨": 22, "역분경": 14, "청강심법": 14,
}
spoilers = ["사형 흑린", "흑린은 진목", "진목의 사형", "육문이 같은 손", "육문은 묵", "주인의 얼굴", "반로환동", "인피면구"]
required = ["episode", "part", "title", "description", "facts", "closure"]

problems = []
def text_of(d):
    # constraints may legitimately name things to avoid; check the rest
    keep = {k: v for k, v in d.items() if k not in ("constraints", "uncertain", "foreshadow")}
    return json.dumps(keep, ensure_ascii=False)

for d in drafts:
    tag = f"ep{int(d['episode']):02d}-{d['part']} {d.get('title','')}"
    for k in required:
        if not d.get(k):
            problems.append(f"{tag}: missing {k}")
    if not (2 <= len(d.get("closure", [])) <= 4):
        problems.append(f"{tag}: closure count {len(d.get('closure', []))}")
    body = text_of(d)
    for t in protected:
        if t in body:
            problems.append(f"{tag}: protected term '{t}'")
    for t in spoilers:
        if t in body:
            problems.append(f"{tag}: spoiler '{t}'")
    for term, ep in first_allowed.items():
        if int(d["episode"]) < ep and term in body:
            problems.append(f"{tag}: '{term}' appears before {ep}화")
    if any(f.get("kind") not in ("FIXED_FACT", "REQUIRED_RESULT", "OFFSCREEN_RESULT") for f in d.get("facts", [])):
        problems.append(f"{tag}: bad fact kind")

eps = sorted({int(d["episode"]) for d in drafts})
print(f"drafts={len(drafts)} episodes={len(eps)} missing={[n for n in range(1,37) if n not in eps]}")
for p in problems:
    print("-", p)
