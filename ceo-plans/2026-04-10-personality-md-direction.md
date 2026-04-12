# personality.md 方向探索（Daily/Weekly Coach Context）

## 背景
希望把用户过去的记录（任务完成、情绪、阻碍、反思）逐步沉淀为一个 `personality.md`，在 daily / weekly coach 场景中作为 LLM 的长期上下文。

目标不是“给用户贴标签”，而是形成**可更新、可解释、友好且有同理心**的用户画像，使建议更贴近用户真实处境。

---

## 设计目标

1. **友好与积极**
   - 默认采用鼓励式语气。
   - 优先识别用户已有进步和可复用的成功策略。

2. **理解用户难处**
   - 记录长期压力源和常见阻碍（时间碎片化、精力波动、外部依赖等）。
   - 建议应体现现实约束，而不是理想化目标。

3. **可演化（incremental）**
   - 每次新增记录只做小幅更新。
   - 对“稳定特征”慢更新，对“短期状态”快更新。

4. **可追溯与安全**
   - 每个结论都尽量能追溯到近期记录片段。
   - 避免敏感标签化；以“观察到的模式”表述，允许不确定性。

---

## personality.md 建议结构（v0）

```md
# Personality Profile (Living Document)

## 1) Strength Signals（优势信号）
- ...

## 2) Motivation Patterns（动机模式）
- ...

## 3) Friction & Constraints（阻碍与约束）
- ...

## 4) Effective Strategies（已验证有效的方法）
- ...

## 5) Coaching Preferences（反馈偏好）
- 语气：...
- 节奏：...
- 建议粒度：...

## 6) Recent Changes（最近变化，2-4周窗口）
- ...

## 7) Confidence & Open Questions（置信度与待确认问题）
- 高置信：...
- 低置信：...
```

---

## 更新机制（建议）

### 输入
- 日志原始记录（文本 / 标签 / 时间）
- daily/weekly 回顾摘要

### 处理流程
1. **抽取候选观察**：从新记录中提取“行为模式 + 情境 + 结果”。
2. **去偏与中性化改写**：把评价性语言改为观察性语言。
3. **与现有画像融合**：
   - 若与已有内容一致：提升置信度。
   - 若冲突：保留“近期变化”并降低旧结论权重。
4. **写回 personality.md**：限制每个 section 长度，保持可读性。

### 更新频率
- Daily coach：读取，不一定写回。
- Weekly coach：集中更新（推荐）。

---

## Coach Prompt 使用原则

在系统提示中明确：
- 先肯定用户努力与进展，再给建议。
- 建议必须考虑 `Friction & Constraints`。
- 每次最多给 1-3 条可执行建议。
- 若画像置信度低，先提澄清问题而非直接下结论。

---

## MVP 实施建议

### Phase 1（本周可做）
- 新增 `personality.md` 生成/更新脚本（先规则+模板）。
- weekly 任务中触发一次更新。
- coach prompt 接入 `personality.md` 的 3 个 section：
  1) Strength Signals
  2) Friction & Constraints
  3) Effective Strategies

### Phase 2
- 引入“证据片段 + 时间衰减”评分。
- 增加“近期变化检测”。

### Phase 3
- 做 A/B：有无 personality context 对建议采纳率和满意度的影响。

---

## 成功指标（可观测）
- 用户主观反馈：建议“更懂我”的评分提升。
- 行为指标：建议执行率、连续打卡率、weekly 完成率。
- 质量指标：反馈中“过于理想化/不贴近实际”表述下降。

---

## 风险与防护
- **风险：固化偏见** → 使用“可变描述 + 置信度 + 最近变化”机制。
- **风险：语气生硬** → coach 模板中加入同理句式和积极 framing。
- **风险：上下文过长** → 保持结构化摘要，控制 token 预算。

---

## 下一步（建议立刻执行）
1. 确认 `personality.md` 的落盘位置（用户级单文件 or 数据库存储后渲染）。
2. 定义 weekly 更新 job 的输入输出接口。
3. 增加一版 coach prompt，并在 staging 观察一周。

---

## Office-hours 风格评审（隐私 / 产品冲突 / 实施风险）

> 说明：由于当前环境无法读取你提供的 `$office-hours` skill 文件路径，这里按同类评审框架给出结构化审查与修订建议。

### A. 隐私风险审查（Privacy Risks）

#### A1) 过度留存风险（Data Over-Retention）
- 风险：`personality.md` 作为长期文件，容易把本应短期使用的信息无限期保留。
- 建议控制：
  - 设置字段级 TTL（例如 `Recent Changes` 默认 28 天滚动窗口）。
  - 仅保留“模式摘要”，不保留大段原始日志。
  - 为每条观察增加 `last_seen_at`，超期自动降权或删除。

#### A2) 敏感信息二次暴露（Sensitive Inference Leakage）
- 风险：模型可能从日志推断出健康、家庭、财务等敏感信息并写入长期画像。
- 建议控制：
  - 在更新前做敏感类别过滤（health / finance / relationship 等）。
  - 默认禁止写入敏感类别，除非用户明确 opt-in。
  - 在 coach prompt 中禁止基于敏感推断给出确定性结论。

#### A3) 用途漂移（Purpose Creep）
- 风险：`personality.md` 从“教练上下文”被扩展到排序、营销或其他目的。
- 建议控制：
  - 文档中显式限定用途：仅用于 daily/weekly coach 回复优化。
  - 在实现层标注 `purpose=coaching_only`，并在调用链做断言。

#### A4) 用户不可见/不可控（Lack of User Control）
- 风险：用户不知道系统存了什么，导致信任风险。
- 建议控制：
  - 提供“查看/编辑/重置 personality”入口。
  - 提供“暂不用于建议（pause personalization）”开关。
  - 每次 weekly 更新后给用户一条可读摘要与撤回入口。

---

### B. 与核心产品方向冲突（Core Product Conflicts）

#### B1) 与“行动优先”目标冲突
- 冲突点：若 profile 太重，系统可能更擅长“解释用户”，但削弱“推动行动”。
- 调整建议：
  - prompt 中强制输出结构：`1句肯定 + 1个障碍重述 + 1~3个下一步行动`。
  - 把 personality 作为约束条件，而不是结论终点。

#### B2) 与“简洁记录体验”冲突
- 冲突点：若引导用户补充过多画像信息，会增加记录负担。
- 调整建议：
  - 仅从已有日志被动抽取，不增加必填字段。
  - 澄清问题最多 1 个/次，且可跳过。

#### B3) 与“用户主导叙事”冲突
- 冲突点：系统画像可能覆盖用户自我定义。
- 调整建议：
  - 增加 `User Stated Preferences` section，优先级高于模型推断。
  - 所有推断语句使用概率措辞（“可能”“近期观察到”）。

---

### C. 实施风险（Implementation Risks）

#### C1) 更新质量漂移
- 风险：随着日志增多，摘要可能变得笼统或自相矛盾。
- 缓解：
  - 每次更新做冲突检测（新旧 observation 对比）。
  - 对每条 observation 维护 `confidence_score` 与证据计数。

#### C2) 上下文膨胀与成本
- 风险：`personality.md` 越来越长，导致 token 成本与延迟上涨。
- 缓解：
  - 按 section 设置硬上限（例如每 section ≤ 5 bullets）。
  - 推理时仅注入与当前问题相关的 2-3 个 section。

#### C3) 错误建议责任边界
- 风险：系统“过于懂你”后给出高置信建议，若不适配用户情境会放大伤害感。
- 缓解：
  - 加入不确定性声明策略（低置信先提问）。
  - 对高风险建议类型（健康/财务/法律）做硬性降级到通用建议。

#### C4) 观测指标失真
- 风险：仅看“执行率”可能鼓励短期、低价值建议。
- 缓解：
  - 指标拆分为：采纳率、完成后满意度、次周复发率（是否反复卡在同一问题）。

---

## 建议补充的最小策略（可直接纳入 Phase 1）

1. **数据最小化**：只写模式，不写原文；默认不写敏感推断。
2. **用户控制**：支持查看/编辑/关闭 personality。
3. **用途限定**：仅 coach 使用，禁止外溢到推荐/营销。
4. **安全提示**：低置信先澄清，高风险话题降级。
5. **长度治理**：section 上限 + 相关性检索注入。

---

## Phase 1 验收门槛（Go/No-Go Checklist）

- [ ] 已实现敏感信息过滤与默认拒写策略。
- [ ] 已提供 personality 的可见、可编辑、可关闭能力。
- [ ] 已实现 section 长度上限与过期淘汰（TTL）。
- [ ] 已在 prompt 中加入“不确定先澄清”与“建议 1-3 条”约束。
- [ ] 已定义并埋点：采纳率 + 满意度 + 次周复发率。

若以上任一未满足，建议只在小流量灰度，不全量发布。

---

## 复评结果（按 plan-ceo-review + gstack-office-hours）

### 1) plan-ceo-review 打分（1-5）
- Strategic clarity: **4/5**
- Execution readiness: **3/5**
- Measurement quality: **3/5**
- Risk containment: **4/5**

结论：**Conditional Go（条件通过）**，前提是完成 Phase 1 Go/No-Go 清单并补齐 owner/里程碑。

### 2) Strengths（优势）
- 问题定义清楚：以“更懂用户处境”的 coach 反馈质量提升为核心。
- 结构完整：目标、机制、MVP、指标、风险均有覆盖。
- 安全意识较好：已有 TTL、敏感信息过滤、用途限定与用户控制建议。

### 3) Prioritized Gaps（优先缺口）
1. 缺少明确 owner 与交付时序（谁负责数据策略、谁负责 prompt、谁负责评估）。
2. 指标仍偏结果层，需要补 leading indicators（如澄清问题触发率、低置信占比）。
3. 缺少回滚标准（何时立即停用 personality context）。

### 4) office-hours 红黄旗

#### Red Flags（发布阻断项）
- 若未提供“用户可见 + 可关闭 personalization”，不应全量上线。
- 若未对敏感推断做默认拒写，不应全量上线。

#### Yellow Flags（需监控）
- 上下文长度膨胀导致响应慢与成本上涨。
- 过度“画像化”导致建议听起来不够行动导向。

### 5) Required Mitigations Before Launch（上线前必做）
- 增加 rollback 条件：
  - 用户负反馈率连续 7 天上升超过阈值。
  - “建议不贴近实际”标签占比超过阈值。
- 增加 owner matrix：
  - PM（策略/验收）、BE（更新作业与存储）、ML/Prompt（提示模板）、Data（指标看板）。
- 增加 trial 计划：先 5%-10% 用户灰度 1 周。

### 6) 1-week Trial Plan（建议）
- Day 1-2：只读注入（不写回），验证 prompt 质量与延迟。
- Day 3-4：开启 weekly 写回，监控敏感过滤命中率与用户编辑/关闭行为。
- Day 5-7：评估采纳率、满意度、复发率，并决定扩大或回滚。
