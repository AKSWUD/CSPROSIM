"use strict";

// 六维属性和位置权重。总评为六项属性的加权和；权重不低于 0.20 的属性标记为核心。
const ATTRS = [
  [
    "aim",
    "枪法"
  ],
  [
    "sense",
    "意识"
  ],
  [
    "utility",
    "道具"
  ],
  [
    "movement",
    "身法"
  ],
  [
    "reaction",
    "反应"
  ],
  [
    "mental",
    "心态"
  ]
];
const ROLES = {
  "狙击手": {
    "aim": 0.32,
    "sense": 0.15,
    "utility": 0.03,
    "movement": 0.06,
    "reaction": 0.24,
    "mental": 0.2
  },
  "突破手": {
    "aim": 0.28,
    "sense": 0.1,
    "utility": 0.02,
    "movement": 0.2,
    "reaction": 0.2,
    "mental": 0.2
  },
  "步枪手": {
    "aim": 0.28,
    "sense": 0.18,
    "utility": 0.08,
    "movement": 0.12,
    "reaction": 0.16,
    "mental": 0.18
  },
  "指挥": {
    "aim": 0.1,
    "sense": 0.32,
    "utility": 0.18,
    "movement": 0.04,
    "reaction": 0.1,
    "mental": 0.26
  },
  "辅助": {
    "aim": 0.14,
    "sense": 0.22,
    "utility": 0.3,
    "movement": 0.04,
    "reaction": 0.1,
    "mental": 0.2
  },
  "自由人": {
    "aim": 0.18,
    "sense": 0.26,
    "utility": 0.1,
    "movement": 0.14,
    "reaction": 0.12,
    "mental": 0.2
  }
};
const ATTR_KEYS = ATTRS.map(([key]) => key);
const ATTR_LABEL = Object.fromEntries(ATTRS);
const ROLE_NAMES = Object.keys(ROLES);

// 俱乐部按快照排名固定分档；base 为 NPC 巅峰属性基准，churn 为年度交易概率。
// 同档位再按名次增加 0～4 点潜力，使排名靠前的俱乐部拥有更强的人才基准。
const TIERS = [
    {name: "挑战者", base: 46, churn: 0.60, min_rank: 43, max_rank: 50},
    {name: "二线队", base: 62, churn: 0.40, min_rank: 31, max_rank: 42},
    {name: "一线队", base: 76, churn: 0.22, min_rank: 17, max_rank: 30},
    {name: "世界强队", base: 85, churn: 0.10, min_rank: 6, max_rank: 16},
    {name: "顶级豪门", base: 93, churn: 0.04, min_rank: 1, max_rank: 5},
];

function vrs_tier(rank) {
    return TIERS.findIndex(tier => tier.min_rank <= rank && rank <= tier.max_rank);
}

// 游戏 Top20 权重按 VRS 名次线性递减：第 1 名 1.20，第 50 名 0.80；不是官方个人评分。
function vrs_weight(rank) {
    return 1.20 - (rank - 1) / 49 * 0.40;
}

const BOUNDS = [
  0,
  46,
  62,
  76,
  85
];

// 世界时间与退役边界。NPC 按年龄概率退役；玩家另外受最低总评和强制退役年龄限制。
const START_YEAR = 2013;
const MAX_YEARS = 22;
const FORCE_RETIRE_AGE = 32;
const NPC_MAX_AGE = 40;
const MIN_OVERALL = 22;

// 赛事配置：field 为赛事强度，fame 为名气倍率；赛历按队伍档位分流。
const GRADE_CFG = {
  "C": {
    "field": 38,
    "fame": 0.4
  },
  "B": {
    "field": 55,
    "fame": 0.7
  },
  "A": {
    "field": 68,
    "fame": 1.0
  },
  "S": {
    "field": 78,
    "fame": 1.5
  },
  "MAJOR": {
    "field": 86,
    "fame": 2.5
  }
};
const ANNUAL_CALENDAR = [
  {
    "month": "2月",
    "name": "城市网吧联赛",
    "grade": "C",
    "min_tier": 0,
    "max_tier": 1
  },
  {
    "month": "4月",
    "name": "次级联赛",
    "grade": "B",
    "min_tier": 0,
    "max_tier": 1
  },
  {
    "month": "6月",
    "name": "地区公开预选赛",
    "grade": "C",
    "min_tier": 0,
    "max_tier": 1
  },
  {
    "month": "6月",
    "name": "ESL Pro League",
    "grade": "A",
    "min_tier": 2,
    "max_tier": 4
  },
  {
    "month": "7月",
    "name": "IEM Katowice",
    "grade": "S",
    "min_tier": 2,
    "max_tier": 4
  },
  {
    "month": "9月",
    "name": "Major 春季赛",
    "grade": "MAJOR",
    "min_tier": 2,
    "max_tier": 4,
    "is_major": true
  },
  {
    "month": "10月",
    "name": "IEM Cologne",
    "grade": "S",
    "min_tier": 2,
    "max_tier": 4
  },
  {
    "month": "12月",
    "name": "Major 秋季赛",
    "grade": "MAJOR",
    "min_tier": 2,
    "max_tier": 4,
    "is_major": true
  }
];

// 成绩阈值决定球队名次；RESULT_BONUS 调整个人 Rating，RESULT_FAME 调整名气。
const RESULT_TABLE = [
  [
    0.18,
    "小组出局"
  ],
  [
    0.45,
    "八强"
  ],
  [
    0.7,
    "四强"
  ],
  [
    0.88,
    "亚军"
  ],
  [
    1.01,
    "冠军"
  ]
];
const RESULT_FAME = {
  "小组出局": 0,
  "八强": 1,
  "四强": 1,
  "亚军": 2,
  "冠军": 3
};
const RESULT_BONUS = {
  "冠军": 0.1,
  "亚军": 0.05,
  "四强": 0.01,
  "八强": -0.03,
  "小组出局": -0.07
};

// 事件属性增益统一缩放；名气和特殊效果使用各自结算规则。
const EVENT_SCALE = 0.5;

// 事件结构：cond 检查选手状态和下一站是否为 Major，weight 控制符合条件后的抽中概率。
// options 中 fx 的属性数组为闭区间；role 修改位置，tier 表示档位增量，buff 在下一场赛事消耗。
// 转职事件通过 year - last_role_year 限制三年冷却；同一赛季优先抽取尚未发生的事件。
const EVENTS = [
{
  "id": "rookie_practice",
  "title": "青训营的加练",
  "desc": "熄灯后教练留下你: \"想出头, 就比别人多练两小时。\"",
  "weight": 4,
  "options": [
    {
      "text": "留下来加练到凌晨",
      "fx": {
        "aim": [
          3,
          6
        ],
        "mental": [
          -2,
          0
        ]
      },
      "result": "枪法肉眼可见地涨了, 只是黑眼圈也涨了。"
    },
    {
      "text": "跟队友开黑放松一下",
      "fx": {
        "mental": [
          2,
          4
        ],
        "aim": [
          -1,
          1
        ]
      },
      "result": "队伍氛围融洽了不少, 手上的活儿生疏了一点。"
    },
    {
      "text": "回去早睡, 研究录像",
      "fx": {
        "sense": [
          3,
          5
        ]
      },
      "result": "你对地图的理解又深了一层。"
    }
  ],
  "cond": (p, m) => p.tier_index <= 1
},
{
  "id": "allnight_queue",
  "title": "通宵排位",
  "desc": "凌晨两点, 训练室只剩你和显示器幽幽的光。",
  "weight": 3,
  "options": [
    {
      "text": "干到天亮",
      "fx": {
        "aim": [
          2,
          5
        ],
        "reaction": [
          1,
          3
        ],
        "mental": [
          -3,
          -1
        ]
      },
      "result": "操作是练出来了, 人快废了。"
    },
    {
      "text": "见好就收",
      "fx": {
        "mental": [
          1,
          3
        ]
      },
      "result": "作息规律, 状态在线。"
    },
    {
      "text": "去研究职业选手 demo",
      "fx": {
        "sense": [
          2,
          4
        ],
        "utility": [
          1,
          3
        ]
      },
      "result": "偷学了几手职业细节。"
    }
  ],
  "cond": (p, m) => true
},
{
  "id": "utility_practice",
  "title": "道具专项训练",
  "desc": "教练给你安排了一整套道具投掷练习。",
  "weight": 3,
  "options": [
    {
      "text": "把每张图的点位刷到烂熟",
      "fx": {
        "utility": [
          3,
          6
        ],
        "mental": [
          -1,
          1
        ]
      },
      "result": "你的道具已经能封死半个包点。"
    },
    {
      "text": "随便练练",
      "fx": {
        "utility": [
          1,
          2
        ]
      },
      "result": "聊胜于无。"
    }
  ],
  "cond": (p, m) => ["辅助", "指挥", "步枪手"].includes(p.role)
},
{
  "id": "aim_train",
  "title": "枪法特训",
  "desc": "你在 aim_botz 里一练就是一下午。",
  "weight": 3,
  "options": [
    {
      "text": "死磕预瞄与甩狙",
      "fx": {
        "aim": [
          3,
          6
        ],
        "reaction": [
          2,
          4
        ]
      },
      "result": "准星像是长在了敌人头上。"
    },
    {
      "text": "练练身法走位",
      "fx": {
        "movement": [
          3,
          5
        ],
        "aim": [
          1,
          2
        ]
      },
      "result": "你的走位更加飘忽。"
    }
  ],
  "cond": (p, m) => ["狙击手", "突破手", "步枪手"].includes(p.role)
},
{
  "id": "scout",
  "title": "网吧星探",
  "desc": "你在网吧天梯里大杀四方, 一个西装男递来名片: \"我们缺人。\"",
  "weight": 5,
  "options": [
    {
      "text": "留下联系方式, 去试训",
      "fx": {
        "tier": 1,
        "fame": [
          3,
          6
        ]
      },
      "result": "你正式成为一名职业青训选手!"
    },
    {
      "text": "八成是骗子, 走人",
      "fx": {
        "fame": [
          -1,
          1
        ]
      },
      "result": "名片被你扔进了垃圾桶。"
    }
  ],
  "cond": (p, m) => (p.tier_index === 0 && p.fame < 25)
},
{
  "id": "transfer",
  "title": "转会邀约",
  "desc": "一支级别更高的战队向你抛出橄榄枝, 但意味着要抛下老队友。",
  "weight": 3,
  "options": [
    {
      "text": "接受挑战, 往上走",
      "fx": {
        "tier": 1,
        "fame": [
          2,
          5
        ]
      },
      "result": "你跳上了更大的舞台。"
    },
    {
      "text": "留守老东家",
      "fx": {
        "mental": [
          3,
          5
        ],
        "fame": [
          -1,
          1
        ]
      },
      "result": "队友们把你当成了主心骨。"
    }
  ],
  "cond": (p, m) => 1 <= p.tier_index && p.tier_index <= 3
},
{
  "id": "role_awp",
  "title": "改打狙击位",
  "desc": "教练看中你的枪法与反应: \"队里缺个能扛狙的, 你试试?\"",
  "weight": 2,
  "options": [
    {
      "text": "转型狙击手",
      "fx": {
        "role": "狙击手",
        "aim": [
          2,
          4
        ],
        "reaction": [
          2,
          4
        ],
        "utility": [
          -2,
          0
        ]
      },
      "result": "你开始用 AWP 主宰长枪局。"
    },
    {
      "text": "还是打自己擅长的",
      "fx": {
        "mental": [
          1,
          3
        ]
      },
      "result": "你决定继续深耕本行。"
    }
  ],
  "cond": (p, m) => (p.tier_index >= 1 && p.role !== "狙击手" && (p.year - p.last_role_year) >= 3)
},
{
  "id": "role_igl",
  "title": "临危受命当指挥",
  "desc": "老指挥即将退役, 队伍希望你能接过战术板。",
  "weight": 2,
  "options": [
    {
      "text": "接过指挥权",
      "fx": {
        "role": "指挥",
        "sense": [
          3,
          5
        ],
        "mental": [
          2,
          4
        ],
        "aim": [
          -2,
          0
        ]
      },
      "result": "你成了场上的大脑。"
    },
    {
      "text": "只想专心打枪",
      "fx": {
        "aim": [
          2,
          4
        ]
      },
      "result": "你婉拒了教练的提议。"
    }
  ],
  "cond": (p, m) => (p.tier_index >= 2 && p.role !== "指挥" && p.age >= 20 && (p.year - p.last_role_year) >= 3)
},
{
  "id": "role_support",
  "title": "转型辅助位",
  "desc": "队伍体系需要一名专职道具手, 教练问你愿不愿意牺牲个人数据。",
  "weight": 2,
  "options": [
    {
      "text": "为团队转型辅助",
      "fx": {
        "role": "辅助",
        "utility": [
          4,
          7
        ],
        "sense": [
          1,
          3
        ]
      },
      "result": "你甘愿做那个默默闪光的人。"
    },
    {
      "text": "不做绿叶",
      "fx": {
        "aim": [
          1,
          3
        ],
        "mental": [
          -1,
          1
        ]
      },
      "result": "你更相信自己的枪。"
    }
  ],
  "cond": (p, m) => (p.tier_index >= 1 && !["辅助", "指挥"].includes(p.role) && (p.year - p.last_role_year) >= 3)
},
{
  "id": "role_lurker",
  "title": "改打自由人",
  "desc": "教练觉得你的意识适合独自潜入, 打乱对手节奏。",
  "weight": 2,
  "options": [
    {
      "text": "转型自由人",
      "fx": {
        "role": "自由人",
        "sense": [
          3,
          5
        ],
        "movement": [
          2,
          4
        ]
      },
      "result": "你成了对手后排的幽灵。"
    },
    {
      "text": "保持现位置",
      "fx": {
        "mental": [
          1,
          2
        ]
      },
      "result": "你选择待在舒适区。"
    }
  ],
  "cond": (p, m) => (p.tier_index >= 1 && p.role !== "自由人" && (p.year - p.last_role_year) >= 3)
},
{
  "id": "benched",
  "title": "被下放替补",
  "desc": "近期状态低迷, 教练把你放进了替补席。",
  "weight": 3,
  "options": [
    {
      "text": "疯狂加练证明自己",
      "fx": {
        "aim": [
          4,
          7
        ],
        "mental": [
          -2,
          0
        ]
      },
      "result": "你在训练室里把自己练到脱稿。"
    },
    {
      "text": "申请转会换个环境",
      "fx": {
        "tier": -1,
        "fame": [
          -2,
          0
        ]
      },
      "result": "你降级去了级别更低的队伍重新开始。"
    },
    {
      "text": "找教练谈心",
      "fx": {
        "mental": [
          2,
          4
        ],
        "sense": [
          1,
          2
        ]
      },
      "result": "解开了心结, 教练答应再给你机会。"
    }
  ],
  "cond": (p, m) => p.tier_index >= 2
},
{
  "id": "sponsor",
  "title": "赞助代言",
  "desc": "外设品牌找上门, 代言费很香, 但要占用大量训练时间拍广告。",
  "weight": 3,
  "options": [
    {
      "text": "全部接下, 赚一波",
      "fx": {
        "fame": [
          5,
          9
        ],
        "aim": [
          -2,
          1
        ]
      },
      "result": "银行卡鼓了, 手感凉了。"
    },
    {
      "text": "只接一个象征性代言",
      "fx": {
        "fame": [
          2,
          4
        ]
      },
      "result": "名利与训练兼顾。"
    },
    {
      "text": "拒掉, 专心训练",
      "fx": {
        "aim": [
          2,
          4
        ],
        "utility": [
          1,
          2
        ]
      },
      "result": "你把时间都砸在了训练上。"
    }
  ],
  "cond": (p, m) => p.fame >= 35
},
{
  "id": "injury",
  "title": "腱鞘炎发作",
  "desc": "手腕传来阵阵刺痛, 队医建议你立刻减量。",
  "weight": 3,
  "options": [
    {
      "text": "立刻休养",
      "fx": {
        "injured": true,
        "mental": [
          1,
          3
        ]
      },
      "result": "你选择养伤, 但整个赛季的手感打了折扣。"
    },
    {
      "text": "打封闭硬撑比赛",
      "fx": {
        "aim": [
          -6,
          -3
        ],
        "injured": true,
        "fame": [
          2,
          4
        ]
      },
      "result": "你带伤上阵赢得掌声, 手腕却落下了病根。"
    },
    {
      "text": "找队医做理疗",
      "fx": {
        "aim": [
          -1,
          1
        ]
      },
      "result": "及时处理, 影响不大。"
    }
  ],
  "cond": (p, m) => p.age >= 19
},
{
  "id": "stream",
  "title": "直播副业",
  "desc": "直播平台邀你签约, 打赏可比工资高多了。",
  "weight": 3,
  "options": [
    {
      "text": "认真经营直播",
      "fx": {
        "fame": [
          4,
          8
        ],
        "aim": [
          -2,
          1
        ]
      },
      "result": "你成了小有名气的主播。"
    },
    {
      "text": "偶尔播播",
      "fx": {
        "fame": [
          1,
          3
        ]
      },
      "result": "涨了点粉, 主业没耽误。"
    },
    {
      "text": "不播, 保住训练",
      "fx": {
        "sense": [
          1,
          3
        ]
      },
      "result": "你把精力留给了赛场。"
    }
  ],
  "cond": (p, m) => p.fame >= 20
},
{
  "id": "cheater",
  "title": "天梯遇外挂",
  "desc": "对面明显开了挂, 队友已经在对喷。",
  "weight": 2,
  "options": [
    {
      "text": "冷静举报",
      "fx": {
        "mental": [
          1,
          3
        ]
      },
      "result": "你保持了好心态。"
    },
    {
      "text": "对喷回去",
      "fx": {
        "mental": [
          -3,
          -1
        ],
        "fame": [
          1,
          2
        ]
      },
      "result": "气是出了, 心态也崩了。"
    },
    {
      "text": "无视他, 继续练枪",
      "fx": {
        "aim": [
          2,
          4
        ]
      },
      "result": "你把注意力放回了自己的枪法。"
    }
  ],
  "cond": (p, m) => true
},
{
  "id": "prematch",
  "title": "大赛前夜",
  "desc": "明天就是关键比赛, 今晚怎么过?",
  "weight": 2,
  "options": [
    {
      "text": "早睡养神",
      "fx": {
        "mental": [
          3,
          5
        ]
      },
      "result": "以最佳状态迎接比赛。"
    },
    {
      "text": "通宵 rank 找手感",
      "fx": {
        "aim": [
          2,
          4
        ],
        "mental": [
          -3,
          -1
        ]
      },
      "result": "手感热得发烫, 眼皮也烫。"
    },
    {
      "text": "开小会研究对手",
      "fx": {
        "sense": [
          3,
          5
        ]
      },
      "result": "对手的套路被你们摸透了。"
    }
  ],
  "cond": (p, m) => true
},
{
  "id": "patch",
  "title": "版本大更新",
  "desc": "新版本削弱了你最擅长的枪械, 一切得从头适应。",
  "weight": 2,
  "options": [
    {
      "text": "连夜适应新枪",
      "fx": {
        "aim": [
          3,
          5
        ],
        "mental": [
          -1,
          1
        ]
      },
      "result": "你比别人更快吃透了新版本。"
    },
    {
      "text": "等职业队先摸清套路",
      "fx": {
        "sense": [
          1,
          2
        ]
      },
      "result": "你稳扎稳打, 后发制人。"
    },
    {
      "text": "抱怨版本太烂",
      "fx": {
        "mental": [
          -2,
          0
        ]
      },
      "result": "抱怨解决不了任何问题。"
    }
  ],
  "cond": (p, m) => true
},
{
  "id": "veteran",
  "title": "老将带教",
  "desc": "队里的老将愿意带你复盘, 但他脾气不太好。",
  "weight": 3,
  "options": [
    {
      "text": "虚心请教",
      "fx": {
        "sense": [
          3,
          5
        ]
      },
      "result": "你从老将身上学到了很多。"
    },
    {
      "text": "我行我素",
      "fx": {
        "aim": [
          1,
          3
        ],
        "mental": [
          -1,
          1
        ]
      },
      "result": "你坚持自己的打法。"
    }
  ],
  "cond": (p, m) => p.age <= 20
},
{
  "id": "fanmeet",
  "title": "粉丝线下见面会",
  "desc": "俱乐部安排了一场粉丝见面会, 现场人山人海。",
  "weight": 2,
  "options": [
    {
      "text": "全程参与互动",
      "fx": {
        "fame": [
          4,
          7
        ],
        "mental": [
          -1,
          2
        ]
      },
      "result": "粉丝数量暴涨。"
    },
    {
      "text": "露个面就走",
      "fx": {
        "fame": [
          1,
          3
        ],
        "aim": [
          1,
          2
        ]
      },
      "result": "露脸打卡, 回去接着练。"
    }
  ],
  "cond": (p, m) => p.fame >= 50
},
{
  "id": "roster_shuffle",
  "title": "战队重组",
  "desc": "俱乐部大换血, 队友走了一半, 你的位置也变得微妙。",
  "weight": 2,
  "options": [
    {
      "text": "留守, 跟新阵容磨合",
      "fx": {
        "mental": [
          3,
          5
        ]
      },
      "result": "你成了队伍里的定海神针。"
    },
    {
      "text": "借机跳槽去强队",
      "fx": {
        "tier": 1,
        "fame": [
          2,
          5
        ],
        "mental": [
          -2,
          0
        ]
      },
      "result": "你跳上了更高的台阶。"
    }
  ],
  "cond": (p, m) => p.tier_index >= 2
},
{
  "id": "relationship",
  "title": "感情生活",
  "desc": "一位粉丝的真诚打动了你, 但恋爱意味着分心。",
  "weight": 2,
  "options": [
    {
      "text": "开始一段感情",
      "fx": {
        "mental": [
          3,
          6
        ],
        "aim": [
          -1,
          2
        ]
      },
      "result": "心态更稳了, 训练时间少了一点。"
    },
    {
      "text": "专注事业, 保持单身",
      "fx": {
        "aim": [
          2,
          4
        ],
        "mental": [
          -1,
          1
        ]
      },
      "result": "你把全部精力都给了 CS。"
    }
  ],
  "cond": (p, m) => p.age >= 18
},
{
  "id": "major_final_eve",
  "title": "Major 决赛前夜",
  "desc": "明天就是 Major 决赛, 全世界都在看着你。",
  "weight": 6,
  "options": [
    {
      "text": "冥想调整心态",
      "fx": {
        "mental": [
          5,
          8
        ]
      },
      "result": "你的心跳慢了下来, 眼神无比平静。"
    },
    {
      "text": "加练到深夜",
      "fx": {
        "aim": [
          3,
          6
        ],
        "mental": [
          -3,
          0
        ]
      },
      "result": "手感火热, 但身体很疲惫。"
    },
    {
      "text": "跟家人通个电话",
      "fx": {
        "mental": [
          3,
          6
        ],
        "fame": [
          1,
          2
        ]
      },
      "result": "你找回了打 CS 的初心。"
    }
  ],
  "cond": (p, m) => (m && p.tier_index >= 2)
},
{
  "id": "major_stage",
  "title": "Major 决赛舞台",
  "desc": "站上 Major 决赛的舞台, 聚光灯刺眼, 观众席山呼海啸。",
  "weight": 6,
  "options": [
    {
      "text": "放手一搏, 火力全开",
      "fx": {
        "buff": 0.1,
        "aim": [
          1,
          3
        ],
        "mental": [
          -2,
          1
        ]
      },
      "result": "你在总决赛上彻底放开了。"
    },
    {
      "text": "稳扎稳打, 打体系",
      "fx": {
        "buff": 0.05,
        "mental": [
          2,
          4
        ]
      },
      "result": "你选择相信团队的战术。"
    },
    {
      "text": "把舞台交给队友",
      "fx": {
        "buff": 0.07,
        "sense": [
          1,
          3
        ]
      },
      "result": "你成了队友身后最可靠的后盾。"
    }
  ],
  "cond": (p, m) => (m && p.tier_index >= 2)
}
];
