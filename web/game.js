"use strict";

// 半整数向最近的偶数取整，避免 0.5 倍事件增益长期偏向增加或减少。
function round(value) {
    const lower = Math.floor(value);
    if (value - lower === 0.5) return lower % 2 === 0 ? lower : lower + 1;
    return Math.round(value);
}

function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
}

// 随机工具共用同一个 32 位状态。固定种子和相同选择能复现世界生成及整个生涯。
// 正态抽样缓存第二个样本；洗牌和无放回抽样用于合同邀约、交易及教练交换。
class Random {
    constructor(seed) {
        this.state = seed >>> 0;
        this.gauss_next = null;
    }

    random() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let value = this.state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    randint(low, high) {
        return low + Math.floor(this.random() * (high - low + 1));
    }

    choice(values) {
        return values[this.randint(0, values.length - 1)];
    }

    uniform(low, high) {
        return low + (high - low) * this.random();
    }

    // 逆变换抽样：三角分布的众数控制玩家天赋最集中的位置。
    triangular(low, high, mode) {
        let u = this.random();
        let fraction = (mode - low) / (high - low);
        if (u > fraction) {
            u = 1 - u;
            fraction = 1 - fraction;
            [low, high] = [high, low];
        }
        return low + (high - low) * Math.sqrt(u * fraction);
    }

    // Box–Muller 变换从均匀分布生成两个标准正态样本，再按均值和标准差缩放。
    gauss(mean, deviation) {
        let z = this.gauss_next;
        this.gauss_next = null;
        if (z === null) {
            const angle = this.random() * 2 * Math.PI;
            const radius = Math.sqrt(-2 * Math.log(1 - this.random()));
            z = Math.cos(angle) * radius;
            this.gauss_next = Math.sin(angle) * radius;
        }
        return mean + z * deviation;
    }

    shuffle(values) {
        for (let i = values.length - 1; i > 0; i--) {
            const j = this.randint(0, i);
            [values[i], values[j]] = [values[j], values[i]];
        }
    }

    sample(values, count) {
        const pool = values.slice();
        const chosen = [];
        for (let i = 0; i < count; i++) {
            const index = this.randint(0, pool.length - 1);
            chosen.push(pool[index]);
            pool[index] = pool[pool.length - 1];
            pool.pop();
        }
        return chosen;
    }
}

// 总评按当前职业位置加权；转职不改属性，但会立即改变总评和身价。
function overall_of(p) {
    // 补偿求和保留六项浮点乘积的低位误差，防止总分接近 x.5 时因累加误差改变取整。
    let total = 0, correction = 0;
    for (const key of ATTR_KEYS) {
        const value = ROLES[p.role][key] * p[key];
        const next = total + value;
        correction += Math.abs(total) >= Math.abs(value) ? (total - next) + value : (value - next) + total;
        total = next;
    }
    return round(total + correction);
}

function tier_of(overall) {
    for (let i = BOUNDS.length - 1; i >= 0; i--) {
        if (overall >= BOUNDS[i]) return i;
    }
    return 0;
}

function eligible_tournaments(tier) {
    return ANNUAL_CALENDAR.filter(t => t.min_tier <= tier && tier <= t.max_tier);
}

// 用累计成长的期望反推年轻 NPC 当前属性，使同档位年轻选手仍保留相近的巅峰潜力。
function age_offset(age) {
    let total = 0;
    for (let a = age; a < 27; a++) total += a <= 21 ? 4.5 : a <= 26 ? 2.5 : 1;
    return -total;
}

// 年末先增长年龄，再按此概率处理 NPC 退役；40 岁必退，教练不参与退役。
function npc_retire_chance(age) {
    if (age < 29) return 0;
    if (age <= 31) return 0.08;
    if (age <= 33) return 0.18;
    if (age <= 35) return 0.32;
    if (age <= 37) return 0.50;
    if (age <= 39) return 0.72;
    return 1;
}

// 玩家和 NPC 共用选手模型与年龄曲线。yr_* 每年清空，history/honors/rating_all 跨年累计。
// team 指向队伍对象，队伍 roster 同时持有选手引用；转会必须同步更新两侧关系。
class Player {
    constructor(id, role, age, attrs, team, rng, is_human = false) {
        this.id = id;
        this.role = role;
        this.age = age;
        this.team = team;
        this.is_human = is_human;
        this.talent = is_human ? rng.triangular(0.50, 1.70, 1) : rng.gauss(1, 0.12);
        for (const key of ATTR_KEYS) this[key] = attrs[key];
        this.retired = false;
        this.retire_age = 30 + rng.randint(0, 4); // 展示参考值，不参与实际退役判定。
        this.peak = 0;

        // 年度累计：赛季开始清空，赛事名次和个人表现用于年末 Top20。
        this.yr_ratings = [];
        this.yr_rating_weights = [];
        this.yr_honors = [];
        this.yr_honor_weights = [];
        this.yr_titles = 0;
        this.last_role_year = -3;
        this.fame = 0;
        this.buff = 0;
        this.injured = false;
        this.tier_index = team ? team.tier : 0;

        // 生涯累计：年度荣誉、排名次数和 Rating 历史供结局与身价计算读取。
        this.honors = [];
        this.history = [];
        this.top20_count = 0;
        this.top1_count = 0;
        this.rating_all = [];
        this.yr_avgs = [];

        // 合同剩余年限在年末扣减；contract_len 仅记录开局签约长度。
        this.contract_left = 0;
        this.contract_len = 0;
    }

    overall() {
        return overall_of(this);
    }

    // 身价由总评的 2.3 次幂主导，最近三年 Rating 和荣誉只提供小幅修正。
    // 26 岁后逐年折价、19 岁前另乘 0.85；最终限制为 1～500 万。
    value() {
        const base = (Math.max(this.overall() - 30, 0) / 62) ** 2.3 * 470;
        const recent = this.yr_avgs.slice(-3);
        const perf = recent.length ? (recent.reduce((sum, r) => sum + r, 0) / recent.length - 1) * 35 : 0;
        const honor = Math.min(this.honors.length * 0.6, 10);
        let age_factor = this.age <= 26 ? 1 : Math.max(0.30, 1 - (this.age - 26) * 0.15);
        if (this.age <= 19) age_factor *= 0.85;
        return Math.trunc(clamp((base + perf + honor) * age_factor, 1, 500));
    }

    reset_year() {
        this.yr_ratings = [];
        this.yr_rating_weights = [];
        this.yr_honors = [];
        this.yr_honor_weights = [];
        this.yr_titles = 0;
    }
}

// 队伍强度为五名选手总评的均值，决定团队成绩；个人 Rating 仍按各自实力计算。
class Team {
    constructor(source) {
        this.name = source.name;
        this.vrs_rank = source.rank;
        this.vrs_points = source.points;
        this.tier = vrs_tier(source.rank);
        this.top20_weight = vrs_weight(source.rank);
        const tier = TIERS[this.tier];
        this.potential_base = tier.base + 4 * (tier.max_rank - source.rank) / (tier.max_rank - tier.min_rank);
        this.coach = source.name + " 教练";
        this.roster = [];
    }

    strength() {
        return this.roster.length ? this.roster.reduce((sum, p) => sum + p.overall(), 0) / this.roster.length : 40;
    }
}

// 世界维护 50 支战队和 250 个现役席位。NPC 的生成、年度成长、退役补位与交易集中在这里。
class World {
    constructor(rng) {
        this.rng = rng;
        this.teams = [];
        this.players = [];
        this.reserve_ids = [];
        for (const source of VRS_TEAMS) {
            const team = new Team(source);
            this.teams.push(team);
            for (const id of source.roster) this.gen_npc(team, id);
        }
    }

    // 开局按快照装载各队名单；离队和退役的 ID 回到补位池，后续 NPC 仍只使用这份名单。
    // ID 可以跨代复用，但不创造新名称；源表的同名席位保持独立的选手对象。
    // 新人抽取 17～29 岁，再从俱乐部潜力基准按年龄反推六维属性。
    gen_npc(team, id = null) {
        if (id === null) {
            const index = this.rng.randint(0, this.reserve_ids.length - 1);
            [id] = this.reserve_ids.splice(index, 1);
        }
        const age = this.rng.randint(17, 29);
        const potential = team.potential_base + this.rng.gauss(0, 7);
        const base = potential + age_offset(age);
        const role = this.rng.choice(ROLE_NAMES);
        const attrs = Object.fromEntries(ATTR_KEYS.map(key => [key, clamp(Math.trunc(base + this.rng.gauss(0, 5)), 5, 99)]));
        const player = new Player(id, role, age, attrs, team, this.rng);
        team.roster.push(player);
        this.players.push(player);
        return player;
    }

    grow_all(rng) {
        for (const player of this.players) growth(player, rng);
    }

    // 玩家不会被 NPC 退役逻辑移除；退役 NPC 先离队，再补满五人并清理现役名单。
    advance(rng) {
        for (const player of this.players) player.age += 1;
        for (const team of this.teams) {
            team.roster = team.roster.filter(player => {
                if (player.is_human) return true;
                if (player.age >= NPC_MAX_AGE || rng.random() < npc_retire_chance(player.age)) {
                    player.retired = true;
                    this.reserve_ids.push(player.id);
                    return false;
                }
                return true;
            });
            while (team.roster.length < 5) this.gen_npc(team);
        }
        this.players = this.players.filter(player => !player.retired);
        this.simulate_transfers(rng);
    }

    // 同档位随机交换 NPC；跨档位由强队签走弱队最强 NPC，同时送回自己最弱 NPC。
    // 玩家不进入交易池；档位越高阵容越稳定，教练另以低概率在相邻档位交换。
    simulate_transfers(rng) {
        for (const team of this.teams) {
            if (rng.random() >= TIERS[team.tier].churn) continue;
            const candidates = this.teams.filter(t => t !== team && Math.abs(t.tier - team.tier) <= 1 && t.roster.length);
            if (!candidates.length) continue;
            const other = rng.choice(candidates);
            if (other.tier < team.tier) this._sign(team, other, rng);
            else if (other.tier > team.tier) this._sign(other, team, rng);
            else {
                const a_pool = team.roster.filter(p => !p.is_human);
                const b_pool = other.roster.filter(p => !p.is_human);
                if (!a_pool.length || !b_pool.length) continue;
                const a = rng.choice(a_pool), b = rng.choice(b_pool);
                team.roster.splice(team.roster.indexOf(a), 1);
                other.roster.splice(other.roster.indexOf(b), 1);
                team.roster.push(b);
                other.roster.push(a);
                a.team = other;
                b.team = team;
            }
        }
        if (rng.random() < 0.35) {
            const [a, b] = rng.sample(this.teams, 2);
            if (Math.abs(a.tier - b.tier) <= 1) [a.coach, b.coach] = [b.coach, a.coach];
        }
    }

    // 交换两个 NPC 席位以维持五人阵容，并更新两人的队伍引用。
    _sign(hi, lo, rng) {
        const a_pool = lo.roster.filter(p => !p.is_human);
        const b_pool = hi.roster.filter(p => !p.is_human);
        if (!a_pool.length || !b_pool.length) return;
        const star = a_pool.reduce((a, b) => a.overall() >= b.overall() ? a : b);
        const weak = b_pool.reduce((a, b) => a.overall() <= b.overall() ? a : b);
        lo.roster.splice(lo.roster.indexOf(star), 1);
        hi.roster.splice(hi.roster.indexOf(weak), 1);
        lo.roster.push(weak);
        hi.roster.push(star);
        star.team = hi;
        weak.team = lo;
        if (rng.random() < 0.35) {
            const [a, b] = rng.sample(this.teams, 2);
            if (Math.abs(a.tier - b.tier) <= 1) [a.coach, b.coach] = [b.coach, a.coach];
        }
    }

    human_teammates(human) {
        return human.team.roster.filter(p => !p.is_human);
    }

    // 其余队伍按“平均实力 + 正态波动”排序后分配名次，再逐人计算 Rating 和年度荣誉。
    // 排序前每队只抽一次成绩扰动，避免排序比较次数影响随机数消耗或破坏排序一致性。
    simulate_year(rng, exclude_team) {
        for (const event of ANNUAL_CALENDAR) {
            const teams = this.teams.filter(t => t !== exclude_team && t.roster.length && event.min_tier <= t.tier && t.tier <= event.max_tier);
            const scored = teams.map(team => ({team, score: team.strength() + rng.gauss(0, 9)}));
            scored.sort((a, b) => b.score - a.score);
            scored.forEach(({team}, rank) => {
                const result = placement(rank, scored.length);
                for (const player of team.roster) record_performance(player, result, event, rng);
            });
        }
    }

    // 年度评分 = 每场 Rating × 当时俱乐部权重的均值 × 100 + 各项荣誉积分 × 获奖时权重。
    // 展示 Rating 仍为原始均值；权重在参赛时固定，年末转会不能追溯修改旧队表现。
    compute_top20() {
        const ranked = [];
        for (const player of this.players) {
            if (!player.yr_ratings.length) continue;
            const avg = player.yr_ratings.reduce((sum, r) => sum + r, 0) / player.yr_ratings.length;
            const weighted_rating = player.yr_ratings.reduce((sum, rating, i) => sum + rating * player.yr_rating_weights[i], 0) / player.yr_ratings.length;
            const weighted_honors = player.yr_honors.reduce((sum, honor, i) => sum + honor_points([honor]) * player.yr_honor_weights[i], 0);
            ranked.push([weighted_rating * 100 + weighted_honors, avg, player]);
        }
        ranked.sort((a, b) => b[0] - a[0]);
        return ranked.slice(0, 20);
    }
}

// NPC 批量赛事中的排名从零开始：冠军、亚军、四强、八强，之后均为小组出局。
function placement(rank, n) {
    if (rank === 0) return "冠军";
    if (rank === 1) return "亚军";
    if (rank <= 3) return "四强";
    if (rank <= 7) return "八强";
    return "小组出局";
}

// 个人 Rating 由总评、心态、随机表现及团队成绩组成；Major 额外扣 0.03。
function individual_rating(player, result, event, rng) {
    let base = 0.55 + player.overall() / 100 * 0.85 + rng.uniform(-0.12, 0.12) + (player.mental - 50) / 400;
    base += RESULT_BONUS[result] || 0;
    if (event.is_major) base -= 0.03;
    return clamp(base, 0.35, 1.80);
}

function honor_points(honors) {
    let points = 0;
    for (const [, grade, result] of honors) {
        if (grade === "MAJOR") points += result === "冠军" ? 15 : 6;
        else if (grade === "S") points += result === "冠军" ? 8 : 0;
        else if (grade === "A") points += result === "冠军" ? 4 : 0;
        else points += result === "冠军" ? 2 : 0;
    }
    return points;
}

// 两类赛事共用个人结算，记录本场俱乐部权重，并让冠军或 Major 亚军荣誉使用相同权重。
function record_performance(player, result, event, rng) {
    const weight = player.team.top20_weight;
    player.yr_ratings.push(individual_rating(player, result, event, rng));
    player.yr_rating_weights.push(weight);
    if (result === "冠军" || (result === "亚军" && event.is_major)) {
        player.yr_honors.push([event.name, event.grade, result]);
        player.yr_honor_weights.push(weight);
        if (result === "冠军") player.yr_titles += 1;
    }
}

// 排名表仅展示最有代表性的荣誉，优先级为 Major 冠军、Major 亚军、S 冠军、其他冠军。
function brief_honor(honors) {
    if (honors.some(([, grade, result]) => grade === "MAJOR" && result === "冠军")) return "Major 冠军";
    if (honors.some(([, grade, result]) => grade === "MAJOR" && result === "亚军")) return "Major 亚军";
    if (honors.some(([, grade, result]) => grade === "S" && result === "冠军")) return "S 级冠军";
    const champion = honors.find(([, , result]) => result === "冠军");
    return champion ? champion[0] + " 冠军" : "";
}

// 玩家转会先释放新队最低总评 NPC 的名单 ID，再补满旧队并接收玩家，保持五人阵容。
function move_to_team(world, p, new_team, rng) {
    const old_team = p.team;
    if (new_team === old_team) return null;
    const old_index = old_team.roster.indexOf(p);
    if (old_index >= 0) old_team.roster.splice(old_index, 1);
    if (new_team.roster.length >= 5) {
        const victim = new_team.roster.reduce((a, b) => a.overall() <= b.overall() ? a : b);
        new_team.roster.splice(new_team.roster.indexOf(victim), 1);
        victim.retired = true;
        world.reserve_ids.push(victim.id);
        const index = world.players.indexOf(victim);
        if (index >= 0) world.players.splice(index, 1);
    }
    world.gen_npc(old_team);
    new_team.roster.push(p);
    p.team = new_team;
    p.tier_index = new_team.tier;
    return `${old_team.name} -> ${new_team.name} (${TIERS[new_team.tier].name})`;
}

// 事件转会按档位增量找队伍；合同剩余年限保持原值，不另开一份新合同。
function change_tier(p, delta, rng) {
    const tier = clamp(p.tier_index + delta, 0, TIERS.length - 1);
    if (tier === p.tier_index) return null;
    const candidates = p.world.teams.filter(t => t.tier === tier && t !== p.team);
    return candidates.length ? move_to_team(p.world, p, rng.choice(candidates), rng) : null;
}

// 特殊效果先结算，随后依次处理六维属性和名气；转职会记录赛季编号以控制冷却。
// 属性变化缩放后取整并限制到 1～99，名气不缩放且允许保留赛事结算产生的小数。
function apply_effects(p, fx, rng, lines) {
    if ("buff" in fx) {
        p.buff += fx.buff;
        lines.push(`本场临场状态加成 +${round(fx.buff * 100)}%`);
    }
    if (fx.injured) {
        p.injured = true;
        lines.push("带上了伤病");
    }
    if ("role" in fx && fx.role !== p.role) {
        lines.push(`转职: ${p.role} -> ${fx.role}`);
        p.role = fx.role;
        p.last_role_year = p.year;
    }
    if ("tier" in fx) {
        const message = change_tier(p, fx.tier, rng);
        if (message) lines.push("转会: " + message);
    }
    for (const [key, label] of [...ATTRS, ["fame", "名气"]]) {
        if (!(key in fx)) continue;
        let delta = rng.randint(...fx[key]);
        if (key === "fame") p.fame = clamp(p.fame + delta, 0, 100);
        else {
            delta = round(delta * EVENT_SCALE);
            p[key] = clamp(p[key] + delta, 1, 99);
        }
        if (delta) lines.push(label + " " + signed(delta));
    }
}

// 先筛触发条件与同年去重，再按权重累加抽样；所有可用事件用完后才允许同年重复。
function draw_event(p, rng, upcoming_major, used_ids) {
    let pool = EVENTS.filter(e => e.cond(p, upcoming_major) && !used_ids.has(e.id));
    if (!pool.length) pool = EVENTS.filter(e => e.cond(p, upcoming_major));
    if (!pool.length) return null;
    const roll = rng.random() * pool.reduce((sum, e) => sum + e.weight, 0);
    let cumulative = 0;
    for (const event of pool) {
        cumulative += event.weight;
        if (roll < cumulative) return event;
    }
    return pool[pool.length - 1];
}

// 选择接口返回从零开始的索引。自动模式仅使用随机数，不创建等待用户的按钮。
async function present_event(event, auto, rng, io) {
    io.write();
    io.write(c("【事件】" + event.title, YELLOW + ";" + BOLD));
    io.write("  " + event.desc);
    if (!auto) return io.choose("请选择你的行动", event.options.map(option => option.text));
    event.options.forEach((option, i) => io.write(`   ${i + 1}. ${option.text}`));
    const index = rng.randint(0, event.options.length - 1);
    io.write(c("   -> 自动选择: " + event.options[index].text, DIM));
    return index;
}

// 同一年龄阶段对所有六维属性采用相同成长规则；29 岁后仅意识和心态保持缓慢增长。
// 伤病在年末额外扣枪法并清除，不持续影响下一年；峰值在成长后更新。
function growth(p, rng) {
    const g = (low, high) => Math.max(1, round(rng.randint(low, high) * p.talent));
    if (p.age <= 21) {
        for (const key of ATTR_KEYS) p[key] = clamp(p[key] + g(3, 6), 1, 99);
    } else if (p.age <= 26) {
        for (const key of ATTR_KEYS) p[key] = clamp(p[key] + g(1, 4), 1, 99);
    } else if (p.age <= 28) {
        for (const key of ATTR_KEYS) p[key] = clamp(p[key] + rng.randint(0, 2), 1, 99);
    } else {
        for (const key of ["aim", "movement", "reaction", "utility"]) p[key] = clamp(p[key] - rng.randint(3, 6), 1, 99);
        for (const key of ["sense", "mental"]) p[key] = clamp(p[key] + rng.randint(0, 1), 1, 99);
    }
    if (p.injured) {
        p.aim = clamp(p.aim - rng.randint(1, 3), 1, 99);
        p.injured = false;
    }
    p.peak = Math.max(p.peak, p.overall());
}

// 赛历在年初按档位固定，年中转会不重建赛历。年初必有事件，年中及可选年末再插入事件。
function build_year_timeline(tier, rng) {
    const tournaments = eligible_tournaments(tier);
    const count = rng.random() < 0.65 ? 2 : 3;
    const slots = tournaments.length + 1;
    const positions = new Set([0]);
    if (count >= 2 && slots > 1) positions.add(Math.max(1, Math.floor(tournaments.length / 2)));
    if (count >= 3) positions.add(tournaments.length);
    while (positions.size < count && positions.size < slots) positions.add(rng.randint(0, slots - 1));
    const timeline = [];
    tournaments.forEach((event, i) => {
        if (positions.has(i)) timeline.push(["event", null]);
        timeline.push(["tourney", event]);
    });
    if (positions.has(tournaments.length)) timeline.push(["event", null]);
    if (!timeline.length) timeline.push(["event", null]);
    return timeline;
}

// 团队成绩由一次均匀随机数、相对赛事强度和临场加成决定，全队共享名次但各自抽 Rating。
function play_team_tournament(team, event, rng, buff) {
    const roll = clamp(rng.random() + (team.strength() - GRADE_CFG[event.grade].field) / 50 + buff, 0, 1);
    let result = "冠军";
    for (const [threshold, name] of RESULT_TABLE) {
        if (roll < threshold) {
            result = name;
            break;
        }
    }
    for (const player of team.roster) record_performance(player, result, event, rng);
    return result;
}

// 玩家赛事和事件按时间线推进；每次事件等待一次选择，赛事则自动完成结算。
// buff 可由多次事件累积，但在下一站比赛后全部清零；名气只根据玩家个人 Rating 变化。
async function play_human_year(human, rng, auto, io) {
    io.write();
    io.write(c("-".repeat(56), DIM));
    io.write(`  ${START_YEAR + human.year - 1} 年   ${human.age} 岁   ${c(human.team.name, CYAN)}  [${TIERS[human.tier_index].name} / VRS #${human.team.vrs_rank}]   位置: ${human.role}   合同 ${Math.max(human.contract_left, 0)} 年`);
    io.write("  本年赛历: " + eligible_tournaments(human.tier_index).map(t => t.name + (t.is_major ? c("*", RED) : "")).join(" / "));
    io.write(c("-".repeat(56), DIM));

    const timeline = build_year_timeline(human.tier_index, rng);
    const used_ids = new Set();
    let just_won_major = false;
    for (let i = 0; i < timeline.length; i++) {
        const [kind, payload] = timeline[i];
        if (kind === "event") {
            const next = timeline[i + 1];
            const upcoming = Boolean(next && next[0] === "tourney" && next[1].is_major);
            const event = draw_event(human, rng, upcoming, used_ids);
            if (!event) continue;
            used_ids.add(event.id);
            const index = await present_event(event, auto, rng, io);
            const lines = [];
            apply_effects(human, event.options[index].fx, rng, lines);
            io.write("   " + c(event.options[index].result, DIM));
            lines.forEach(line => io.write("     " + c(line, GREEN)));
        } else {
            const event = payload;
            const result = play_team_tournament(human.team, event, rng, human.buff);
            human.buff = 0;
            const rating = human.yr_ratings[human.yr_ratings.length - 1];
            human.fame = clamp(human.fame + ((rating - 0.98) * 4 + RESULT_FAME[result]) * GRADE_CFG[event.grade].fame, 0, 100);
            const tag = event.is_major ? c("MAJOR ", RED) : "";
            const result_color = ["冠军", "亚军"].includes(result) ? GREEN : YELLOW;
            io.write(`  >> ${tag}[${event.month}] ${pad(event.name, 18)} ${c(result, result_color)}   Rating ${c(rating.toFixed(2), CYAN)}`);
            if (result === "冠军") io.write("     " + c(`${STAR} ${human.age} 岁 ${event.name} 冠军`, YELLOW));
            if (event.is_major && result === "冠军") {
                just_won_major = true;
                io.write("  " + c("*** 你举起了 Major 冠军奖杯! ***", YELLOW + ";" + BOLD));
            }
        }
    }
    return just_won_major;
}

// 到期邀约最多三支队伍，同时约束玩家实力档位和当前队伍档位，防止一次跨越两档。
// 自动模式有 55% 概率续约，否则优先选择档位最高、同档实力最强的邀约。
async function contract_decision(world, human, rng, auto, io) {
    io.write();
    io.write(c("  【合同到期】", YELLOW + ";" + BOLD) + ` 你与 ${c(human.team.name, CYAN)} 的合同已经结束。`);
    const want_tier = tier_of(human.overall());
    let candidates = world.teams.filter(t => t !== human.team && Math.abs(t.tier - want_tier) <= 1 && Math.abs(t.tier - human.tier_index) <= 1);
    if (!candidates.length) candidates = world.teams.filter(t => t !== human.team && Math.abs(t.tier - human.tier_index) <= 1);
    if (!candidates.length) candidates = world.teams.filter(t => t !== human.team);
    rng.shuffle(candidates);
    const offers = candidates.slice(0, 3);

    if (auto) {
        if (!offers.length || rng.random() < 0.55) {
            human.contract_left = rng.randint(2, 4);
            io.write(c(`   -> 自动选择: 续约 ${human.contract_left} 年`, DIM));
        } else {
            const target = offers.reduce((a, b) => a.tier > b.tier || (a.tier === b.tier && a.strength() >= b.strength()) ? a : b);
            const message = move_to_team(world, human, target, rng);
            human.contract_left = rng.randint(2, 4);
            io.write(c("   -> 自动选择: 换队  " + (message || ""), DIM));
        }
        return;
    }

    const options = ["续约留队", ...offers.map(team => `加盟 ${team.name} (${TIERS[team.tier].name} / VRS #${team.vrs_rank})`)];
    const index = await io.choose("合同到期：续约还是加盟其他队伍？", options);
    if (index === 0) {
        human.contract_left = rng.randint(2, 4);
        io.write(`   你与 ${human.team.name} 续约 ${human.contract_left} 年。`);
    } else {
        const message = move_to_team(world, human, offers[index - 1], rng);
        human.contract_left = rng.randint(2, 4);
        io.write("   " + c(message, GREEN));
    }
}

// 先询问 Major 夺冠退役，再询问 28 岁起的常规退役；自动模式默认征战到 30 岁。
async function ask_retire(player, auto, just_won_major, io) {
    if (just_won_major && !auto) {
        const index = await io.choose("你刚刚捧起 Major 奖杯，要不要就此功成身退？", ["功成身退", "继续职业生涯"]);
        if (index === 0) return "Major 夺冠后功成身退, 留下最完美的背影";
    }
    if (player.age >= 28) {
        if (auto) return player.age >= 30 ? "征战多年后选择退役" : null;
        const index = await io.choose("继续职业生涯，还是就此退役？", ["宣布退役", "继续职业生涯"]);
        if (index === 0) return "主动宣布退役";
    }
    return null;
}

// 结局优先看 Major 冠军，再看峰值与 Top20 入选次数；其他赛事冠军保留在荣誉室展示。
function grade_of(player) {
    const majors = player.honors.filter(h => h.includes("Major") && h.includes("冠军")).length;
    if (majors >= 3) return ["S+", "CS 之神 —— 一个时代由你定义"];
    if (majors >= 2) return ["S", "世界第一 —— 多届 Major 冠军得主"];
    if (majors >= 1 || player.peak >= 84 || player.top20_count >= 3) return ["A", "顶级选手 —— 世界赛场上的常客"];
    if (player.peak >= 66 || player.top20_count >= 1) return ["B", "稳定一线 —— 靠实力吃饭的职业选手"];
    if (player.peak >= 48) return ["C", "二线老将 —— 有过高光, 更多是挣扎"];
    return ["D", "青训陨落 —— 天赋终究没能兑现"];
}

// 开局列出位置及权重最高的两项属性；选择完成后才生成世界，位置抽样不消耗世界随机序列。
async function pick_role(rng, auto, io) {
    if (auto) return rng.choice(ROLE_NAMES);
    const options = ROLE_NAMES.map(role => {
        const core = Object.entries(ROLES[role]).sort((a, b) => b[1] - a[1]).slice(0, 2);
        return `${role}（重${core.map(([key]) => ATTR_LABEL[key]).join("/")}）`;
    });
    return ROLE_NAMES[await io.choose("选择你的位置", options)];
}

// 玩家从第 43～50 名的挑战者队起步，替换最低总评成员；六维为 18～32，合同为 2～4 年。
function make_human(world, name, role, rng) {
    if (!name) name = "无名之辈";
    const team = rng.choice(world.teams.filter(t => t.tier === 0));
    const attrs = Object.fromEntries(ATTR_KEYS.map(key => [key, rng.randint(18, 32)]));
    const human = new Player(name, role, 16, attrs, team, rng, true);
    human.world = world;
    human.year = 0;
    human.contract_len = rng.randint(2, 4);
    human.contract_left = human.contract_len;
    if (team.roster.length >= 5) {
        const victim = team.roster.reduce((a, b) => a.overall() <= b.overall() ? a : b);
        team.roster.splice(team.roster.indexOf(victim), 1);
        victim.retired = true;
        world.reserve_ids.push(victim.id);
        const index = world.players.indexOf(victim);
        if (index >= 0) world.players.splice(index, 1);
    }
    team.roster.push(human);
    world.players.push(human);
    return human;
}

// 一个赛季依次完成：清年度记录 → 玩家赛历 → 其他队伍 → Top20 → 全员成长 → 总结与历史。
// 随后全员增龄、NPC 退役交易、合同结算，最后判定玩家退役；增龄后不会再打当年的赛事。
async function run_game(name, role, seed, auto, io) {
    const rng = new Random(seed);
    const world = new World(rng);
    const human = make_human(world, name, role, rng);
    banner(io);
    io.write();
    io.write(`  选手 ${c(human.id, CYAN)} 出生于 CS 的黄金年代, 16 岁, 天赋初现。`);
    io.write(`  天赋评级: ${c(talent_stars(human.talent), YELLOW)}   位置: ${c(human.role, MAGENTA)}`);

    while (!human.retired && human.year < MAX_YEARS) {
        human.year += 1;
        for (const player of world.players) player.reset_year();
        const start_attrs = Object.fromEntries(ATTR_KEYS.map(key => [key, human[key]]));
        const start_fame = human.fame;
        const start_value = human.value();
        const start_tier = human.tier_index;

        const just_won_major = await play_human_year(human, rng, auto, io);
        world.simulate_year(rng, human.team);
        const ranking = world.compute_top20();
        const yr = human.yr_ratings;
        const avg = yr.length ? yr.reduce((sum, r) => sum + r, 0) / yr.length : 0;
        human.rating_all.push(...yr);
        const year_label = START_YEAR + human.year - 1;
        const rank_line = print_top20(ranking, human, year_label, io);

        world.grow_all(rng);
        human.yr_avgs.push(avg);
        show_status(human, io);
        print_annual_summary(human, start_attrs, start_fame, start_value, rank_line, io);
        for (const [event, , result] of human.yr_honors) human.honors.push(`${human.age} 岁 ${event} ${result}`);
        human.history.push({
            year: year_label, age: human.age, team: human.team.name, tier: TIERS[start_tier].name,
            n: yr.length, titles: human.yr_titles, avg, honors: human.yr_honors.slice(),
        });

        world.advance(rng);
        human.contract_left -= 1;
        if (human.contract_left <= 0 && human.age < FORCE_RETIRE_AGE) {
            await contract_decision(world, human, rng, auto, io);
        }
        if (human.age >= FORCE_RETIRE_AGE) {
            human.retired = true;
            human.retire_reason = `年满 ${FORCE_RETIRE_AGE} 岁, 正式告别职业赛场`;
            break;
        }
        if (human.overall() < MIN_OVERALL) {
            human.retired = true;
            human.retire_reason = "实力跌出职业门槛, 被迫退役";
            break;
        }
        const reason = await ask_retire(human, auto, just_won_major, io);
        if (reason) {
            human.retired = true;
            human.retire_reason = reason;
            break;
        }
    }
    ending(human, io);
    return human;
}


