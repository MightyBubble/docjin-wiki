# 战斗系统公式展示

在这个文档中，我们将测试跨文件引用变量和公式计算的能力。。。

## 英雄初始属性对比

战士和法师是我们的两个初始英雄，我们可以直接跨文件引用它们的属性并进行一些平衡性计算。

### 战士 (Warrior) 的属性

从 `Hero/Warrior.md` 引用：

- 基础生命: {{ref: Hero/Warrior.md::BaseHP}}
- 基础攻击: {{ref: Hero/Warrior.md::BaseAtk}}

### 法师 (Mage) 的属性

从 `Hero/Mage.md` 引用：

- 基础生命: {{ref: Hero/Mage.md::BaseHP}}
- 魔法攻击: {{ref: Hero/Mage.md::BaseMagAtk}}

---

## 伤害计算测试

假设怪物防御力为固定的 10 点，我们来计算法师一个普攻能造成的伤害：

{{var: MonsterDef=10}}
怪物防御: {{ref: MonsterDef}}

**法师普攻伤害计算公式 (魔法攻击 - 怪物防御)：**
计算结果：{{calc: BaseMagAtk - MonsterDef}} 点伤害。

> 注意：因为上面已经通过 `ref` 引用过 `BaseMagAtk`（它会在后台被缓存为当前上下文的变量），所以我们在 `calc` 中可以直接使用它！

---

## 嵌入测试 (Embed)

下面我们将仅把 `Hero/Warrior.md` 的 `基础属性` 这一章节嵌入进来：

{{embed: Hero/Warrior.md#基础属性}}
