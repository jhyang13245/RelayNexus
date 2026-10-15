# Normalizes merged drafts. 2~11화 manuscripts do not number days, and the two inferred counts
# (forward from 1화, backward from 07's fixed '12화 밤 = 28일차') disagree by one day, so inside
# those events absolute day numbers become relative ones (이튿날, 사흘째 ...). 07 fixes days from 12화.
import json, glob, re, sys, os
work = sys.argv[1]
KOR = {1: '이튿날', 2: '사흘째', 3: '나흘째', 4: '닷새째'}
def relative(s):
    nums = [int(m.group(1)) for m in re.finditer(r'(\d+)(?:~\d+)?일차', s)]
    if not nums: return s
    base = nums[0]
    def rep(m):
        a = int(m.group(1)); b = m.group(2)
        if b:
            span = int(b) - a + 1
            return f'{span}일에 걸쳐 '
        k = a - base
        return '' if k == 0 else KOR.get(k, f'{k + 1}일째') + ' '
    s = re.sub(r'표행\s*', '', s)
    s = re.sub(r'(\d+)(?:~(\d+))?일차\s*', rep, s)
    s = s.replace('(사흘), ', '').replace('  ', ' ').strip(' ,')
    return s
for path in sorted(glob.glob(os.path.join(work, 'drafts', 'ep*.json'))):
    rows = json.load(open(path, encoding='utf-8')); changed = False
    for e in rows:
        ep = int(e['episode'])
        if 2 <= ep <= 11:
            tp = relative(e.get('timePlace', ''))
            if tp != e.get('timePlace'): e['timePlace'] = tp; changed = True
            for f in e['facts']:
                t = re.sub(r'\((\d+)일차\)', '', f['text']).replace('20일차 새벽', '이튿날 새벽')
                if t != f['text']: f['text'] = t; changed = True
        if ep == 12 and e['part'] == 1 and '26~28일차' in e.get('timePlace', ''):
            e['timePlace'] = e['timePlace'].replace('표행 26~28일차(사흘), 28일차', '표행 28일차(양하가 말한 사흘의 끝)'); changed = True
    if changed:
        json.dump(rows, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('ok')
