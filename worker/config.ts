import { RULES } from '../shared/game';
import type { PublicConfig } from '../shared/contracts';
export const CONFIG: PublicConfig = {
  rules: RULES,
  stages: [
    { label: 'Baby', title: '작은 시작', caption: '모든 반짝임은 작은 씨앗에서', image: null },
    { label: 'Kid', title: '자라는 꿈', caption: '조금씩, 더 넓은 세상으로', image: null },
    { label: 'Debut', title: '첫 번째 무대', caption: '꿈이 빛을 만나는 순간', image: null },
    { label: 'Growth', title: '눈부신 계절', caption: '어제보다 더 환하게', image: null },
    { label: 'Now', title: '지금의 서연', caption: '우리의 가장 빛나는 지금', image: null },
  ],
};
