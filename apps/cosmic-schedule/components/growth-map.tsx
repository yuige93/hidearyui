'use client';

import { useMemo, useState } from 'react';
import {
  BookOpen,
  Calculator,
  Check,
  CircleDot,
  Languages,
  Minus,
  Orbit,
  Plus,
  Rocket,
  Target,
} from 'lucide-react';
import type { ClassicProgress } from '@/lib/planner';

type RouteKey = 'math' | 'classics' | 'english';
type RouteNode = {
  id: string;
  window: string;
  title: string;
  short: string;
  state: 'done' | 'current' | 'future';
  purpose: string;
  milestone: string;
  practice: string;
  tip?: string;
  milestones?: {
    id: string;
    label: string;
    target: number;
    unit: string;
    note: string;
  }[];
};

const mathNodes: RouteNode[] = [
  {
    id: 'math-foundation',
    window: '阶段 1',
    title: '10以内关系',
    short: '探索数量、拆合与基本加减',
    state: 'current',
    purpose: '从适合自己的数量经验出发，探索10以内的拆合关系，为后续围绕十思考打基础。',
    milestone: '能直接处理10以内数量和基本加减，进入“把十看成一个单位”。',
    practice: '用棋子、图画或生活中的物品表示数量，尝试拆分、合并并说出自己的发现。',
  },
  {
    id: 'math-unitising',
    window: '阶段 2',
    title: '十个成组',
    short: '一把棋子，十个一组，看出几十几',
    state: 'future',
    purpose: '把十个散子单位化成“一个十”，建立十进制最核心的结构。',
    milestone: '面对100以内随机数量，成组后直接说出几个十、几个一，并能在棋子、语言和数字之间来回转换。',
    practice: '每次抓20—80个棋子，十个摆成固定阵列；报数、写数、反向按数字摆数。',
  },
  {
    id: 'math-near-ten',
    window: '阶段 3',
    title: '围绕整十看数',
    short: '8是10少2，18是20少2',
    state: 'future',
    purpose: '让十从计数单位变成计算参照，为凑十和拆十作准备。',
    milestone: '能说明一个数离前后整十有多远，并用棋子证明。',
    practice: '保留完整十组，改变散子；练习“多几个、少几个、还差几个”。',
  },
  {
    id: 'math-make-ten',
    window: '阶段 4',
    title: '凑十与拆十',
    short: '8＋5先补2；13－5先回到10',
    state: 'future',
    purpose: '把跨十加减变成看得见的移动，而不是背一个计算口诀。',
    milestone: '能自己决定如何拆第二个数，并把棋子移动说成完整算式。',
    practice: '先做9加几，再到8、7、6加几；减法从回到10开始，再比较不同拆法。',
  },
  {
    id: 'math-within-20',
    window: '阶段 5',
    title: '20以内关系网',
    short: '加减互逆、缺失数与生活问题',
    state: 'future',
    purpose: '把一个个答案连接成数的关系，为迁移到两位数作准备。',
    milestone: '一道加法能生成相关减法；能用实物、图、语言和算式表示同一问题。',
    practice: '题组、盖住一部分、给算式编故事、找出错误摆法。',
  },
  {
    id: 'math-place-value',
    window: '阶段 6',
    title: '十位与个位',
    short: '几十几加减个位或整十',
    state: 'future',
    purpose: '把20以内形成的十结构整体迁移到100以内。',
    milestone: '能解释28＋5与8＋5的共同结构，也能说明加20只改变几个十。',
    practice: '整组移动与散子移动分开进行；同步画简图、写展开式。',
  },
  {
    id: 'math-exchange',
    window: '阶段 7',
    title: '合十与拆十',
    short: '理解两位数进位和退位',
    state: 'future',
    purpose: '用“十个一换一个十”解释进位，用逆向交换解释退位。',
    milestone: '能说明新的一组十从哪里来，或为什么要拆开一组十；随后再接学校的书写方式。',
    practice: '先棋子、再十位个位简图、最后算式；每次保留口头解释。',
  },
  {
    id: 'math-hundred',
    window: '阶段 8',
    title: '十个十是一百',
    short: '完成十进制第一层地图',
    state: 'future',
    purpose: '把“以十为单位”的经验向上再单位化一次。',
    milestone: '理解百、十、个的关系；面对100以内新问题，能选择棋子、图或心算并自行检查。',
    practice: '组成100、估计后成组验证、混合解决路线节点中的问题。',
  },
];

const englishNodes: RouteNode[] = [
  {
    id: 'english-pink',
    window: '示例起点',
    title: 'Pink',
    short: '从适合自己的阅读难度开始',
    state: 'current',
    purpose: '从适合自己的难度探索指词、短句和图文对应，把听懂、认读和连贯表达连接起来。',
    milestone: '分两天读5本陌生Pink，至少4本达到每20词帮助不超过1次，并能说出主要人物、事件或一个事实。',
    practice: '每周5本新书；一本新书搭配当周旧书1—2本，从第二周起再回看前周旧书1本；周末打乱顺序选读和复述。',
  },
  {
    id: 'english-magenta',
    window: '起点评估后',
    title: 'Magenta',
    short: '高频词、重复句式与词组朗读',
    state: 'future',
    purpose: '从最初短句进入更稳定的高频词和重复句式，开始按词组读，而不是逐词停顿。',
    milestone: '分两天试读3本陌生Magenta，至少2本在每10—20词帮助约1次时仍能继续读，并理解主要内容。',
    practice: '先用两周桥接：每周3本Pink＋2本Magenta；表现稳定后由Magenta接任教学主线，Pink进入独立易读篮。',
  },
  {
    id: 'english-red',
    window: 'Emergent → Early 1',
    title: 'Red',
    short: '更长故事、标点与基础拼读',
    state: 'future',
    purpose: '把重复句式里的成功经验迁移到更长故事，连接标点停顿、高频词和基础拼读。',
    milestone: '连续两周在陌生同级文本中保持准确、理解、连贯、尝试解码和自我修正。',
    practice: '继续每周5本主线与滚动复读；每天只反馈一个最影响连贯阅读的卡点。',
  },
  {
    id: 'english-yellow',
    window: 'Early 2',
    title: 'Yellow',
    short: '句子增长、推理与非虚构结构',
    state: 'future',
    purpose: '适应更长句子，开始从故事线索和信息结构中推断意义。',
    milestone: '连续两周在陌生同级故事与非虚构文本中读得连贯，并能说出核心内容或依据。',
    practice: '故事与非虚构交替；复述时任选人物、事件、事实或“我从哪里看出来”。',
  },
  {
    id: 'english-blue',
    window: 'Early 3',
    title: 'Blue',
    short: '复杂词汇、印刷惯例与信息文本',
    state: 'future',
    purpose: '扩展词汇和句法，同时学会利用标题、图注、版式等信息文本线索。',
    milestone: '面对陌生同级文本，能综合字母—声音、上下文、图和版式继续阅读并保持理解。',
    practice: '每周保留科学分级或非虚构书，读完说一个事实，并指出它来自文字、图片还是图注。',
  },
  {
    id: 'english-green',
    window: 'Early 4',
    title: 'Green',
    short: '拼读规律、复杂句法与流利基础',
    state: 'future',
    purpose: '让解码、句法和意义整合逐渐自动化，为流利阅读阶段建立稳定基础。',
    milestone: '连续两周跨故事与信息文本保持自然停顿、准确理解，并能主动修正部分错误。',
    practice: '新书、当周复读和隔周提取继续并行；反馈逐步转向停顿、语调和意义表达。',
  },
  {
    id: 'english-orange',
    window: 'Fluency 1',
    title: 'Orange',
    short: '速度、停顿、语调与意义整合',
    state: 'future',
    purpose: '从“能够读出”迈向“读得像在讲述”，让速度服务于表达和理解。',
    milestone: '陌生同级文本中速度稳定、停顿自然、语调能传达意义，复述保留关键情节或信息。',
    practice: '选择短段进行有目的的重复阅读，同时保留同难度新书扩展词汇和迁移。',
  },
  {
    id: 'english-turquoise',
    window: 'Fluency 2',
    title: 'Turquoise',
    short: '更丰富词汇与更长篇章',
    state: 'future',
    purpose: '在篇幅增长后继续维持理解，积累更丰富的故事语言与主题词汇。',
    milestone: '能跨页保持人物、事件和信息线索，遇到新词后仍能恢复连贯阅读。',
    practice: '每次阅读后只聊一个最有意思的情节、事实或新词，保留完整阅读体验。',
  },
  {
    id: 'english-purple',
    window: 'Fluency 3',
    title: 'Purple',
    short: '复杂信息、推理与篇章理解',
    state: 'future',
    purpose: '从复述表层内容走向连接跨页信息、解释原因并形成简单推断。',
    milestone: '能够用文本线索回答“为什么”和“你从哪里知道”，并保持整体理解。',
    practice: '故事与知识书交替，每周选一次自然讨论，问题来自真实好奇而非固定测验。',
  },
  {
    id: 'english-gold',
    window: 'Fluency 4',
    title: 'Gold',
    short: '多类型文本与稳定流利阅读',
    state: 'future',
    purpose: '把流利阅读迁移到不同体裁，形成稳定、可持续的独立阅读能力。',
    milestone: '跨多种体裁维持准确、连贯和理解，并能根据文本目的调整阅读方式。',
    practice: '主线继续升级，同时扩大自由选书比例，让阅读量和兴趣共同支撑稳定性。',
  },
  {
    id: 'english-silver',
    window: 'Advanced Fluency 1',
    title: 'Silver',
    short: '24页文本、主题词汇与多样体裁',
    state: 'future',
    purpose: '进入更长、更完整的文本，在主题词汇增加时维持篇章理解。',
    milestone: '能在24页左右的陌生文本中追踪主线，读后概括重要内容并提出问题。',
    practice: '分段或整本阅读均可；第二天先回忆前文，再继续阅读。',
  },
  {
    id: 'english-emerald',
    window: 'Advanced Fluency 2',
    title: 'Emerald',
    short: '更高信息密度与篇章结构',
    state: 'future',
    purpose: '识别信息如何组织，在细节变多时抓住主题、层次和关键证据。',
    milestone: '能说出一篇文本的主题、主要结构和两项关键细节，并指出它们的关系。',
    practice: '用标题、小节、图表和关键词做轻量导航，读完口头画出内容骨架。',
  },
  {
    id: 'english-ruby',
    window: 'Advanced Fluency 3',
    title: 'Ruby',
    short: '综合理解与跨段信息整合',
    state: 'future',
    purpose: '把不同段落的信息连接起来，比较观点、原因、结果和证据。',
    milestone: '能够综合跨段线索形成解释，区分文本明说的内容和自己的推断。',
    practice: '选择一个真实问题，先阅读取证，再用自己的话说明结论和依据。',
  },
  {
    id: 'english-sapphire',
    window: 'Advanced Fluency 4',
    title: 'Sapphire',
    short: '高阶流利阅读与复杂文本',
    state: 'future',
    purpose: '完成红火箭主线的高阶阶段，形成面对复杂文本时可选择策略、自主理解和检查的能力。',
    milestone: '能独立处理较复杂的陌生文本，概括、推断、取证并发现理解中需要回读的位置。',
    practice: '红火箭作为能力校准，真实兴趣书成为阅读主体；遇到挑战时主动选择慢读、回读、查词或讨论。',
  },
];

const classicsNodes: RouteNode[] = [
  {
    id: 'classic-three-character',
    window: '阅读探索',
    title: '《三字经》',
    short: '短句诵读与节奏体验',
    state: 'current',
    purpose: '可以初次阅读，也可以回读熟悉内容；从短句开始，感受声音和节奏。',
    milestone: '完成回读、熟读确认和随机接诵后点亮。',
    practice: '每次只做一个短段，遇到已经熟悉的部分快速通过。',
    tip: '提示：先让孩子自己接，停顿后再给上句或首字，不要求一次全部恢复。',
    milestones: [
      { id: 'read', label: '完整诵读', target: 3, unit: '遍', note: '分段完成也可以，累计为完整一遍。' },
      { id: 'fluent', label: '熟读确认', target: 2, unit: '次', note: '少量提示下能够顺畅接读。' },
      { id: 'recite', label: '随机接诵', target: 6, unit: '段', note: '从不同位置抽查，不按固定顺序背。' },
    ],
  },
  {
    id: 'classic-surnames',
    window: '阅读探索',
    title: '《百家姓》',
    short: '体验节奏与连续诵读',
    state: 'future',
    purpose: '通过短段诵读感受声音节奏，根据熟悉程度选择初读或回读。',
    milestone: '完成三轮回读、两次顺畅接读和随机接诵后点亮。',
    practice: '每次诵读一小段，随机换起点，避免只会从第一句开始。',
    tip: '提示：不解释每个姓氏；遇到家人、同学的姓，可以顺手建立生活连接。',
    milestones: [
      { id: 'read', label: '完整诵读', target: 3, unit: '遍', note: '可以拆成多次，完成全文算一遍。' },
      { id: 'fluent', label: '熟读确认', target: 2, unit: '次', note: '节奏稳定，停顿位置自然。' },
      { id: 'recite', label: '随机接诵', target: 5, unit: '段', note: '随机给出开头，能够继续接下去。' },
    ],
  },
  {
    id: 'classic-filial',
    window: '阅读探索',
    title: '《孝经》',
    short: '诵读章句并联系生活',
    state: 'future',
    purpose: '从少量章句开始，把诵读与生活中的关心、尊重和责任连接起来。',
    milestone: '全文回读、重点章熟读和自选章背诵全部完成后点亮。',
    practice: '一次只处理一章；诵读后用一句生活中的话说说它在讲什么。',
    tip: '提示：不把古代伦理直接变成服从要求；重点讨论关心、尊重和责任。',
    milestones: [
      { id: 'read', label: '完整诵读', target: 6, unit: '遍', note: '按章轮读，全部覆盖算一遍。' },
      { id: 'fluent', label: '重点章熟读', target: 6, unit: '章', note: '选择孩子能理解、愿意讨论的章节。' },
      { id: 'recite', label: '自选章背诵', target: 3, unit: '章', note: '由孩子参与选择，不追求全文背诵。' },
    ],
  },
  {
    id: 'classic-thousand',
    window: '新学主线',
    title: '《千字文》',
    short: '四字句、词汇和连续篇章',
    state: 'future',
    purpose: '用稳定四字节奏，从短篇蒙学过渡到更连续的古典表达。',
    milestone: '诵读、熟读和分段背诵都达到约定次数后点亮。',
    practice: '新读一小段，随后连接旧段；每周保留一次只回读、不推进。',
    tip: '提示：先固定一个版本；难懂词句只解释影响整体理解的部分。',
    milestones: [
      { id: 'read', label: '完整诵读', target: 30, unit: '遍', note: '分段累计，完整覆盖全文算一遍。' },
      { id: 'fluent', label: '熟读确认', target: 10, unit: '次', note: '随机选择已学部分，能够顺畅接续。' },
      { id: 'recite', label: '分段背诵', target: 8, unit: '段', note: '按意义完整的段落计算，不硬切字数。' },
    ],
  },
  {
    id: 'classic-rhyme',
    window: '声律主线',
    title: '《声律启蒙·上卷》',
    short: '十五韵，对仗、声音与意象',
    state: 'future',
    purpose: '让孩子听出字词之间的对应关系，形成古典汉语的声音和意象感。',
    milestone: '十五韵完成初读与熟读，并背下自选的八个重点段。',
    practice: '每韵分段推进；读熟以后找对子、换词语、说喜欢的画面。',
    tip: '提示：背诵段落由孩子挑选；先感受声音，不急着讲格律术语。',
    milestones: [
      { id: 'read', label: '完成初读', target: 15, unit: '韵', note: '每一韵从头到尾读过一轮。' },
      { id: 'fluent', label: '达到熟读', target: 15, unit: '韵', note: '能够跟住节奏，少量生字不妨碍连贯。' },
      { id: 'recite', label: '自选段背诵', target: 8, unit: '段', note: '选择声音和画面最喜欢的段落。' },
    ],
  },
  {
    id: 'classic-analects',
    window: '全年并行',
    title: '《论语·短章》',
    short: '短章诵读、理解和生活连接',
    state: 'future',
    purpose: '从韵文进入短而完整的经典原文，把学习、相处和改错放进讨论。',
    milestone: '完成全年选章的诵读、熟读、背诵和讲述目标后点亮。',
    practice: '每周一章；先读原文，再用自己的话讲一个相关的小故事。',
    tip: '提示：选章表单独维护；不追求按全书顺序推进，也不把一句话讲成标准答案。',
    milestones: [
      { id: 'read', label: '诵读短章', target: 40, unit: '章', note: '每周选择一章，允许回读喜欢的内容。' },
      { id: 'fluent', label: '达到熟读', target: 20, unit: '章', note: '能连贯诵读并知道大意。' },
      { id: 'recite', label: '背诵短章', target: 10, unit: '章', note: '从熟读内容中自由选择。' },
      { id: 'tell', label: '讲出自己的理解', target: 5, unit: '章', note: '能联系一次真实经历或自己编的情境。' },
    ],
  },
];

const supportLanes = {
  math: [
    {
      title: '表示航线',
      icon: CircleDot,
      stages: ['棋子成组', '十格与简图', '语言和展开式', '心算后回到实物核验'],
    },
    {
      title: '空间航线',
      icon: Orbit,
      stages: ['分类与位置', '平面拼合与立体搭建', '时间与非标准测量', '规律、数据与百数结构'],
    },
    {
      title: '思考航线',
      icon: Target,
      stages: ['估一估', '说清怎么数', '换一种表示', '编问题、找错误、自己检查'],
    },
  ],
  classics: [
    {
      title: '诵读能力',
      icon: CircleDot,
      stages: ['跟住声音', '看文顺读', '少量提示下接诵', '间隔四周仍能恢复'],
    },
    {
      title: '阅读回望',
      icon: Orbit,
      stages: ['熟悉书目定位', '定期回读', '回望阅读发现', '自己的阅读书架'],
    },
    {
      title: '经典入口',
      icon: Target,
      stages: ['短章初读', '按主题积累', '新旧章混读', '选出自己的熟悉章句'],
    },
  ],
  english: [
    {
      title: '主线节奏',
      icon: CircleDot,
      stages: ['一本新书', '当周复读', '隔周回看', '周末重组选读'],
    },
    {
      title: '升级证据',
      icon: Target,
      stages: ['准确度', '理解', '连贯与表达', '解码和自我修正'],
    },
    {
      title: '拓展阅读',
      icon: Orbit,
      stages: ['牛津树／学乐／阅读之星', '科学分级', '培生／果酱口语', '多邻国生活迁移'],
    },
  ],
};

export function GrowthMap({
  classicsProgress,
  onClassicProgressChange,
}: {
  classicsProgress: ClassicProgress;
  onClassicProgressChange: (
    nodeId: string,
    milestoneId: string,
    amount: number,
  ) => void;
}) {
  const [route, setRoute] = useState<RouteKey>('math');
  const nodes = route === 'math' ? mathNodes : route === 'classics' ? classicsNodes : englishNodes;
  const [selectedIds, setSelectedIds] = useState<Record<RouteKey, string>>({
    math: 'math-foundation',
    classics: 'classic-three-character',
    english: 'english-pink',
  });
  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedIds[route]) ?? nodes[0],
    [nodes, route, selectedIds],
  );
  function classicPercent(node: RouteNode) {
    if (!node.milestones?.length) return 0;
    const achieved = node.milestones.reduce(
      (sum, milestone) =>
        sum +
        Math.min(
          milestone.target,
          classicsProgress[node.id]?.[milestone.id] ?? 0,
        ),
      0,
    );
    const total = node.milestones.reduce(
      (sum, milestone) => sum + milestone.target,
      0,
    );
    return Math.round((achieved / total) * 100);
  }
  function nodeState(node: RouteNode) {
    if (route === 'math') return node.state;
    const percent = classicPercent(node);
    if (percent === 100) return 'done';
    if (percent > 0 || node.id === selected.id) return 'current';
    return 'future';
  }

  return (
    <section className={`growth-map-page route-${route}`}>
      <div className="map-sky">
        <div>
          <span className="map-kicker"><Rocket /> 示例成长路线</span>
          <h1>成长星图</h1>
          <p>给小小宇航员的参考路线，可按自己的兴趣、基础和节奏调整。</p>
        </div>
        <fieldset className="route-switch" aria-label="选择学习航线">
          <button aria-pressed={route === 'math'} onClick={() => setRoute('math')}>
            <Calculator /> 数学航线
          </button>
          <button aria-pressed={route === 'classics'} onClick={() => setRoute('classics')}>
            <BookOpen /> 国学航线
          </button>
          <button aria-pressed={route === 'english'} onClick={() => setRoute('english')}>
            <Languages /> 英语航线
          </button>
        </fieldset>
      </div>

      <div className="map-status">
        <span className="current-beacon"><i /> {route === 'classics' ? '自由书架' : '示例坐标'}</span>
        <strong>{route === 'classics' ? selected.title : nodes.find((node) => node.state === 'current')?.title}</strong>
        <span>{route === 'classics' ? '书目互不锁定' : route === 'english' ? '按表现升级，不按日期赶级' : '三条伴随航线'}</span>
      </div>

      <div className="route-scroll" aria-label={`${route === 'math' ? '数学' : route === 'classics' ? '国学' : '英语'}示例主航线`}>
        <div className="route-line" />
        <div className="route-nodes">
          {nodes.map((node, index) => {
            const displayState = nodeState(node);
            const percent = route === 'classics' ? classicPercent(node) : 0;
            return (
              <button
                key={node.id}
                className={`route-node is-${displayState} ${selected.id === node.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedIds((current) => ({ ...current, [route]: node.id }))}
                aria-pressed={selected.id === node.id}
              >
                <span className="node-window">{node.window}</span>
                <i className="node-planet">
                  {displayState === 'done' ? <Check /> : displayState === 'current' ? <Rocket /> : <span>{index + 1}</span>}
                </i>
                <strong>{node.title}</strong>
                <small>{route === 'classics' && percent > 0 ? `已完成 ${percent}%` : node.short}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="map-lower-grid">
        <article className="node-detail" aria-live="polite">
          <header>
            <span>{selected.window}</span>
            <h2>{selected.title}</h2>
          </header>
          {route === 'classics' && selected.milestones ? (
            <div className="book-progress">
              <p>{selected.purpose}</p>
              <div className="book-progress-heading">
                <strong>本书里程碑</strong>
                <span>{classicPercent(selected)}%</span>
              </div>
              {selected.milestones.map((milestone) => {
                const amount = classicsProgress[selected.id]?.[milestone.id] ?? 0;
                const complete = amount >= milestone.target;
                return (
                  <div className={`book-milestone ${complete ? 'is-complete' : ''}`} key={milestone.id}>
                    <span className="milestone-check">{complete ? <Check /> : <CircleDot />}</span>
                    <span>
                      <strong>{milestone.label}</strong>
                      <small>{milestone.note}</small>
                    </span>
                    <div className="milestone-counter">
                      <b>{Math.min(amount, milestone.target)}/{milestone.target}{milestone.unit}</b>
                      <button
                        type="button"
                        aria-label={`${milestone.label}减少一次`}
                        disabled={amount === 0}
                        onClick={() => onClassicProgressChange(selected.id, milestone.id, amount - 1)}
                      ><Minus /></button>
                      <button
                        type="button"
                        aria-label={`${milestone.label}记录一次`}
                        disabled={complete}
                        onClick={() => onClassicProgressChange(selected.id, milestone.id, amount + 1)}
                      ><Plus /></button>
                    </div>
                  </div>
                );
              })}
              <p className="book-tip">{selected.tip}</p>
            </div>
          ) : (
            <dl>
              <div>
                <dt>为什么走这一站</dt>
                <dd>{selected.purpose}</dd>
              </div>
              <div>
                <dt>通过这站的证据</dt>
                <dd>{selected.milestone}</dd>
              </div>
              <div>
                <dt>落到每周怎么做</dt>
                <dd>{selected.practice}</dd>
              </div>
            </dl>
          )}
        </article>

        <aside className="support-routes">
          <div className="support-heading">
            <span>伴随航线</span>
          </div>
          {supportLanes[route].map((lane) => {
            const Icon = lane.icon;
            return (
              <div className="support-lane" key={lane.title}>
                <strong><Icon /> {lane.title}</strong>
                <div>
                  {lane.stages.map((stage, index) => (
                    <span key={stage}><i>Q{index + 1}</i>{stage}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </aside>
      </div>

    </section>
  );
}
