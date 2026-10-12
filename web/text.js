"use strict";

const CYAN = "36", GREEN = "32", YELLOW = "33", RED = "31", MAGENTA = "35";
const BOLD = "1", DIM = "2";
const STAR = "★", BAR_ON = "█", BAR_OFF = "░";

// 使用颜色及字重标记包装文字，浏览器输出层负责转换为安全的 span 节点。
// 标记可以组合，例如青色加粗使用 "36;1"；结束标记恢复默认文字样式。
function c(text, code) {
    return `\x1b[${code}m${text}\x1b[0m`;
}

// 中文按两列估算宽度，补齐文字表格；窄屏仍可由样式自动换行。
function pad(text, width) {
    text = String(text);
    const length = [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 0x2E80 ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - length));
}

// 属性条按 0～100 映射到固定格数；天赋评级按 0.50～1.70 映射到一至五星。
function bar(value, width = 10) {
    const filled = round(clamp(value, 0, 100) / 100 * width);
    return BAR_ON.repeat(filled) + BAR_OFF.repeat(width - filled);
}

function talent_stars(talent) {
    const n = clamp(round((talent - 0.50) / 1.20 * 4) + 1, 1, 5);
    return STAR.repeat(n) + "·".repeat(5 - n);
}

// 增减数保留正号，便于在年度总结中区分成长和衰退。
function signed(value) {
    const n = round(value);
    return `${n >= 0 ? "+" : ""}${n}`;
}

function show_status(p, io) {
    io.write();
    io.write("  " + c("属性面板", BOLD) + "   位置: " + c(p.role, MAGENTA) +
        "   总评: " + c(p.overall(), CYAN + ";" + BOLD) + c(" (按位置加权)", DIM));
    for (const [key, label] of ATTRS) {
        const core = ROLES[p.role][key] >= 0.20 ? " " + c("核心", YELLOW) : "";
        io.write(`   ${pad(label, 4)} ${bar(p[key])} ${String(p[key]).padStart(3)}${core}`);
    }
    io.write(`   名气 ${round(p.fame)}   身价 ${p.value()} 万   荣誉 ${p.honors.length} 项`);
}

// 年度变化以赛季开始时的快照为基准，包含事件影响、自然成长和表现带来的身价变化。
function print_annual_summary(human, start_attrs, start_fame, start_value, rank_line, io) {
    const yr = human.yr_ratings;
    const avg = yr.length ? yr.reduce((sum, r) => sum + r, 0) / yr.length : 0;
    io.write();
    io.write("  " + c(`== ${START_YEAR + human.year - 1} 年度总结 ==`, BOLD));
    io.write(`   出战 ${yr.length} 站   冠军 ${human.yr_titles} 个   平均 Rating ${c(avg.toFixed(2), CYAN)}`);
    const changed = ATTRS.map(([key, label]) => label + signed(human[key] - start_attrs[key]));
    io.write("   属性变化: " + changed.join("  "));
    const dv = human.value() - start_value;
    const arrow = dv > 0 ? "↑" : dv < 0 ? "↓" : "→";
    io.write(`   名气 ${round(human.fame)} (${signed(human.fame - start_fame)})   身价 ${human.value()} 万 (${arrow}${Math.abs(dv)})`);
    io.write("   " + rank_line);
}

// 排名高亮玩家，并把本次入选及年度第一计入生涯；每个赛季只调用一次。
function print_top20(ranking, human, year_label, io) {
    io.write();
    io.write(c(`  ===== ${year_label} 年度 Top20 评选 =====`, CYAN + ";" + BOLD));
    const index = ranking.findIndex(([, , player]) => player === human);
    ranking.forEach(([score, avg, pl], i) => {
        const line = `  ${String(i + 1).padStart(2)}. ${pad(pl.id, 12)} ${pad(pl.team ? pl.team.name : "-", 14)} ${pad(pl.role, 6)} ${String(pl.age).padStart(2)}岁  Rating ${avg.toFixed(2)}  评分 ${score.toFixed(1)}  ${brief_honor(pl.yr_honors)}`;
        io.write(pl === human ? c(line + "  <- 你", YELLOW + ";" + BOLD) : line);
    });
    if (index >= 0) {
        human.top20_count += 1;
        if (index === 0) human.top1_count += 1;
        return `   世界排名: 第 ${index + 1} 名 (入选 Top20)`;
    }
    return "   世界排名: 未入 Top20";
}

// 战报只读取累计记录；年度赛事荣誉和排名次数已在赛季结束时结算。
function ending(p, io) {
    const [grade, title] = grade_of(p);
    const avg = p.rating_all.length ? p.rating_all.reduce((sum, r) => sum + r, 0) / p.rating_all.length : 0;
    io.write();
    io.write(c("=".repeat(60), CYAN));
    io.write(c("            生 涯 战 报", BOLD));
    io.write(c("=".repeat(60), CYAN));
    io.write(`  选手 ID   : ${p.id}   位置: ${p.role}`);
    io.write(`  职业年限  : ${START_YEAR} 年 - ${START_YEAR + p.year - 1} 年   (16 岁 - ${p.age} 岁, 共 ${p.year} 个赛季)`);
    io.write(`  生涯峰值  : ${p.peak}  (最终 ${p.overall()} )`);
    io.write(`  平均 Rating: ${avg.toFixed(2)}`);
    io.write(`  赛事冠军  : ${p.honors.filter(h => h.includes("冠军")).length} 个`);
    io.write(`  入选 Top20 : ${p.top20_count} 次   (其中年度第一 ${p.top1_count} 次)`);
    io.write(`  身价      : ${p.value()} 万`);
    io.write();
    io.write("  " + c("生涯时间线 (每年一行)", BOLD));
    for (const y of p.history) {
        const mark = y.honors.length ? " " + c(STAR, YELLOW) : "";
        io.write(`   ${y.year}  ${pad(y.age, 3)} 岁  ${pad(y.team, 14)} ${pad("[" + y.tier + "]", 12)} ${String(y.n).padStart(2)}站${y.titles}冠  Rating ${y.avg.toFixed(2)}${mark}`);
    }
    io.write();
    io.write("  " + c("荣誉室", BOLD));
    if (p.honors.length) p.honors.forEach(h => io.write("   " + c(STAR, YELLOW) + " " + h));
    else io.write("   （空空如也）");
    io.write();
    io.write(`  退役原因  : ${p.retire_reason || "——"}`);
    io.write();
    io.write(c(`  最终评级: ${grade}  ${title}`, MAGENTA + ";" + BOLD));
    io.write(c("=".repeat(60), CYAN));
}

function banner(io) {
    io.write(c("=".repeat(60), CYAN));
    io.write(c("        CS 职业选手生涯模拟器   v4.0", BOLD));
    io.write(c("   —— 50 支战队 · 六维属性 · 位置 · 合同 · 年度 Top20 ——", DIM));
    io.write(c("=".repeat(60), CYAN));
    io.write(`  玩法: 从 ${START_YEAR} 年开始, 一年一个赛季, 内有多站赛事(每年两届 Major),`);
    io.write("        赛历间穿插 2~3 个事件; 合同到期由你决定续约或换队;");
    io.write("        每年结束后评选世界 Top20。点击选项推进生涯。");
}
