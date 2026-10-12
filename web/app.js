"use strict";

const output = document.querySelector("#output");
const panel = document.querySelector("#choices-panel");
const question = document.querySelector("#question");
const choices = document.querySelector("#choices");
const start_form = document.querySelector("#start-form");
const player_id = document.querySelector("#player-id");

// 将文字颜色码映射到样式类；只解释已知的颜色和字重，不把输出内容当作 HTML 执行。
const text_styles = {
    "36": "text-cyan", "32": "text-green", "33": "text-yellow",
    "31": "text-red", "35": "text-magenta", "1": "text-bold", "2": "text-dim",
};

// 每次输出一行，按样式标记切分成文本节点和 span。用户 ID 中的尖括号也只显示为普通文字。
function write_line(text = "") {
    const pattern = /\x1b\[([0-9;]*)m/g;
    const fragment = document.createDocumentFragment();
    let start = 0;
    let styles = [];
    for (const match of text.matchAll(pattern)) {
        append_text(text.slice(start, match.index));
        styles = match[1] === "0" ? [] : match[1].split(";").map(code => text_styles[code]).filter(Boolean);
        start = match.index + match[0].length;
    }
    append_text(text.slice(start) + "\n");
    output.append(fragment);

    function append_text(value) {
        if (!value) return;
        if (!styles.length) fragment.append(document.createTextNode(value));
        else {
            const span = document.createElement("span");
            span.className = styles.join(" ");
            span.textContent = value;
            fragment.append(span);
        }
    }
}

// 一次只展示当前问题的按钮，点击后立即禁用并隐藏，保证同一选项不会重复结算。
// Promise 只在点击时完成；游戏逻辑通过 await 暂停，避免用循环轮询用户操作。
const io = {
    write: write_line,

    choose(prompt, options) {
        question.textContent = prompt;
        choices.replaceChildren();
        panel.hidden = false;
        return new Promise(resolve => {
            options.forEach((label, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = `${index + 1}. ${label}`;
                button.addEventListener("click", () => {
                    for (const option of choices.children) option.disabled = true;
                    panel.hidden = true;
                    io.write(c("   -> 选择: " + label, DIM));
                    resolve(index);
                }, {once: true});
                choices.append(button);
            });
            panel.scrollIntoView({block: "nearest"});
        });
    },
};

// 提交 ID 后选择位置，再生成世界。每段生涯使用独立的随机种子。
async function main(name) {
    const seed = Math.floor(Math.random() * 2 ** 30);
    const role = await pick_role(new Random(seed), false, io);
    await run_game(name, role, seed, false, io);
    io.write("\n游戏结束。刷新页面可开始新生涯。");
    panel.hidden = true;
    output.scrollIntoView({block: "end"});
}

// 表单提交同时支持点击和回车；启动后隐藏表单，防止重复开启两个并行生涯。
start_form.addEventListener("submit", event => {
    event.preventDefault();
    start_form.hidden = true;
    main(player_id.value.trim() || "无名之辈").catch(error => {
        panel.hidden = true;
        io.write(c("\n运行失败：" + error.message, RED));
        console.error(error);
    });
}, {once: true});
