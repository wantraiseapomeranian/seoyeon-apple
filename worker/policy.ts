import type { Period } from '../shared/contracts';
export function periodKeys(now: number): Record<Period, string> {
  const kst = new Date(now + 9 * 3600000);
  const daily = kst.toISOString().slice(0, 10);
  kst.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));
  return { all: 'all', daily, weekly: kst.toISOString().slice(0, 10) };
}
const blocked = [
  '운영자',
  '관리자',
  '공식',
  'admin',
  'moderator',
  'official',
  '씨발',
  '시발',
  '씨팔',
  '병신',
  '개새끼',
  '좆',
  '지랄',
  '보지',
  '자지',
  'fuck',
  'shit',
  'nigger',
  '섹스',
];
export function nickname(value: unknown): string {
  if (typeof value !== 'string') throw new Error('닉네임을 입력해주세요.');
  const name = value.normalize('NFKC').trim();
  if (!/^[가-힣A-Za-z0-9_.]{2,10}$/.test(name))
    throw new Error('닉네임은 한글·영문·숫자·_·.으로 2~10자 입력해주세요.');
  const normalized = name.toLowerCase().replace(/[_.0-9]/g, '');
  if (blocked.some((word) => normalized.includes(word)))
    throw new Error('사용할 수 없는 닉네임입니다.');
  return name;
}
