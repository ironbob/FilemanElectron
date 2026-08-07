# 文本过滤器语法设计分析

## 概述

`textExpressionFilter` 是一个为日志分析场景设计的嵌入式过滤表达式引擎，支持布尔逻辑组合、多种匹配模式和大小写控制。整体架构为经典的**词法分析 → 语法分析 → AST 求值**三阶段流水线。

---

## 一、语法定义（BNF）

```
expression := term ( OR term )*
term       := factor ( AND factor )*
factor     := NOT factor
            | '(' expression ')'
            | keyword '(' value ')'

keyword    := co | CO | eq | EQ | word | WORD | reg | REG
value      := <括号内的任意文本，支持嵌套括号>
```

运算符优先级（从低到高）：

| 优先级 | 运算符 | 说明 |
|--------|--------|------|
| 1（最低）| `or` | 逻辑或 |
| 2 | `and` | 逻辑与 |
| 3（最高）| `not` | 逻辑非（前缀一元） |

括号 `()` 可以显式改变优先级。

---

## 二、关键字（匹配谓词）

每个关键字作用于一个文本值，构成最小匹配单元（叶节点）。

| 关键字 | 匹配方式 | 大小写 |
|--------|----------|--------|
| `co(x)` | 包含子串 `x` | 不敏感 |
| `CO(x)` | 包含子串 `x` | 敏感 |
| `eq(x)` | 全文等于 `x` | 不敏感 |
| `EQ(x)` | 全文等于 `x` | 敏感 |
| `word(x)` | 整词匹配 `\bx\b` | 不敏感 |
| `WORD(x)` | 整词匹配 `\bx\b` | 敏感 |
| `reg(x)` | 正则表达式 `x` | 不敏感 |
| `REG(x)` | 正则表达式 `x` | 敏感 |

**命名规律**：小写关键字 = 大小写不敏感；对应全大写关键字 = 大小写敏感。

---

## 三、架构与类层次

### 3.1 公共 API

```
ComposeExpression(expression)
    ├── isValid()   → 解析是否成功
    ├── error()     → 失败时的错误信息
    └── match(text) → 对给定文本执行过滤
```

`ComposeExpression` 是对外的唯一入口，内部封装了完整的解析和求值过程。

### 3.2 处理流水线

```
QString expression
      │
      ▼
   Lexer           词法分析：将字符串切分为 Token 流
      │
      ▼
   Parser           语法分析：递归下降，构建 AST
      │
      ▼
Expression (AST)    抽象语法树（Expression 层次结构）
      │
      ▼
 match(text)        求值：遍历 AST，返回 bool
```

### 3.3 AST 节点类型

```
Expression          (抽象基类，虚方法 match(text))
├── TermExpression  叶节点：keyword(value)
├── UnaryExpression 一元节点：NOT expr
└── BinaryExpression 二元节点：expr AND/OR expr
```

---

## 四、词法分析（Lexer）

`Lexer` 是一个单遍扫描器，按需（lazy）产出 Token，支持的 Token 类型：

| TokenType | 对应文本 |
|-----------|----------|
| `Keyword` | `co`, `CO`, `eq`, `EQ`, `word`, `WORD`, `reg`, `REG` |
| `And` | `and`（大小写不敏感） |
| `Or` | `or`（大小写不敏感） |
| `Not` | `not`（大小写不敏感） |
| `LParen` | `(` |
| `RParen` | `)` |
| `EndOfInput` | 输入结束 |
| `Error` | 无法识别的字符或标识符 |

**重要设计**：`and`/`or`/`not` 关键字匹配时大小写不敏感（用 `compare(..., Qt::CaseInsensitive)`），但匹配谓词关键字（`co` vs `CO`）通过精确的大小写来区分行为，即大小写本身即是语义的一部分。

---

## 五、语法分析（Parser）

采用**递归下降**（Recursive Descent）策略，直接对应 BNF 中的三个层级：

```
parseExpression()   →  处理 OR（最低优先级）
  └── parseTerm()   →  处理 AND
        └── parseFactor()  →  处理 NOT、括号、关键字叶节点
```

### 5.1 值提取的特殊处理

解析 `keyword(value)` 时，值的提取**不经过 Lexer**，而是由 Parser 直接操作 `m_lexer.m_position` 进行括号计数扫描：

```
开括号后，手动逐字符扫描 value 内容
维护 parenCount，遇 '(' +1，遇 ')' -1
parenCount == 0 时停止，截取中间文本作为 value
```

这一设计允许 `value` 中包含任意嵌套括号，例如：
- `reg(foo(bar))` — 正则表达式本身含有括号
- `co(a(b)c)` — 值内有括号的子串搜索

提取完成后手动推进 `m_lexer.m_position`，再调用 `consumeToken()` 重新同步词法分析器状态。

---

## 六、求值（Expression::match）

AST 构建完成后，调用根节点的 `match(text)` 即触发深度优先递归求值：

- **`TermExpression::match`**：根据 `MatchType` 调用 `QString::contains`、`QString::compare` 或 `QRegularExpression::match`
- **`UnaryExpression::match`**：返回子节点结果的逻辑非
- **`BinaryExpression::match`**：AND 时短路求值（`&&`），OR 时短路求值（`||`）

---

## 七、表达式示例

```
co(error)
    → 文本中包含 "error"（不区分大小写）

CO(Error) and not co(warning)
    → 包含 "Error"（区分大小写）且不含 "warning"

(co(user) and co(login)) or co(admin)
    → (含 "user" 且含 "login") 或 含 "admin"

reg(\d{3}-\d{4})
    → 匹配正则 \d{3}-\d{4}（不区分大小写）

word(fail) or word(error)
    → 包含整词 "fail" 或整词 "error"
```

---

## 八、错误处理

解析失败时，`Parser` 将错误信息写入 `m_error`，`parse()` 返回 `nullptr`，`ComposeExpression::isValid()` 随之返回 `false`。常见错误：

- 无法识别的字符或标识符
- 关键字后缺少 `(`
- `keyword(value)` 中括号未闭合
- `keyword(value)` 中值为空
- 表达式末尾存在多余 Token
- `(` 后缺少匹配的 `)`

---

## 九、设计权衡

| 决策 | 做法 | 原因 |
|------|------|------|
| 值提取绕过 Lexer | 手动括号计数 | 允许值内含括号，避免引号转义需求 |
| 大小写通过关键字命名区分 | `co` vs `CO` | 语法简洁，无需额外修饰符 |
| 递归下降解析 | 手写 | 依赖轻量，易于嵌入；输入短，无性能问题 |
| 短路求值 | `&&` / `||` | 减少不必要的正则匹配开销 |
