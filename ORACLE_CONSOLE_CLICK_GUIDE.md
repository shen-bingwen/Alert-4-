# Oracle 后台每一步怎么点

这份是给你照着 Oracle Cloud 控制台一步步点的。

参考官方：

- [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
- [Launching an Instance](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm)
- [Security Rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)

## 0. 你要达到的结果

做完以后你会有：

- 1 台免费的 Linux 云服务器
- 1 个公网 IP
- 已开放 `22`、`80`
- 能登录服务器继续部署你的定投工具

## 1. 注册账号

1. 打开 [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
2. 点 `Start for free`
3. 按页面填：
   - 国家/地区
   - 姓名
   - 邮箱
   - 手机号
   - 密码
   - 地址
   - 信用卡/借记卡验证
4. 提交后等待开通

注意：

- 免费资源是 `Always Free`
- 但创建实例时是否有资源，要看你选的区域当下有没有空位

## 2. 登录 Oracle 控制台

1. 打开 Oracle Cloud 控制台
2. 输入账号
3. 进入主页

如果你第一次进来，先确认你当前区域。

一般在页面右上角附近能看到当前 Region。

如果一个区域没资源，可以换别的可用区域试。

## 3. 创建网络

1. 左上角点菜单
2. 点 `Networking`
3. 点 `Virtual cloud networks`
4. 点 `Start VCN Wizard`
5. 选 `Create VCN with Internet Connectivity`
6. 填：
   - `VCN Name`: `dingtou-vcn`
   - `Compartment`: 默认当前
7. 点 `Next`
8. 点 `Create`

创建完成后，你会得到：

- 一个 VCN
- 一个 public subnet
- 一个 Internet Gateway
- 一套默认路由

## 4. 创建免费实例

1. 左上角点菜单
2. 点 `Compute`
3. 点 `Instances`
4. 点 `Create instance`

### 4.1 基本信息

在 `Create compute instance` 页面填：

- `Name`: `dingtou-monitor`
- `Create in compartment`: 默认当前

### 4.2 选择镜像

在 `Image and shape` 这一块：

1. 找到镜像区域
2. 选：
   - `Ubuntu`
   - 或 `Oracle Linux`

我更建议你选：

- `Ubuntu`

后面命令更顺手。

### 4.3 选择免费规格

1. 点 `Change shape`
2. 在形状窗口里：
   - 选 `Virtual machine`
3. 找带 `Always Free` 标记的规格

优先尝试：

- `VM.Standard.A1.Flex`

如果这个不行，再看：

- `VM.Standard.E2.1.Micro`

如果你选 `VM.Standard.A1.Flex`：

1. 先不要配太大
2. 够跑这一个 Node 服务就行

建议保守选：

- `1 OCPU`
- `6 GB memory` 以内都够

如果免费容量紧张，先配更小。

### 4.4 网络设置

在网络这块确认：

- `Virtual cloud network`: 选你刚建的 `dingtou-vcn`
- `Subnet`: 选 public subnet
- `Assign a public IPv4 address`: 一定要开

这个很关键，不然外面访问不到。

### 4.5 SSH 密钥

在 `Add SSH keys` 这里：

推荐选：

- `Generate a key pair for me`

然后：

1. 下载 `Private Key`
2. 下载 `Public Key`
3. 保存好私钥

后面 SSH 登录靠这个文件。

### 4.6 创建实例

全部确认后：

1. 点 `Create`
2. 等实例进入 `Running`

## 5. 记下公网 IP

实例创建成功后：

1. 进入实例详情页
2. 找到 `Public IP address`
3. 记下来

后面手机访问和 SSH 登录都要用。

## 6. 开放端口

### 方法一：从实例页面进入子网

1. 打开实例详情
2. 找到网络相关信息
3. 点进去 subnet 或 VCN

### 方法二：直接走网络菜单

1. 左上角菜单
2. 点 `Networking`
3. 点 `Virtual cloud networks`
4. 点 `dingtou-vcn`
5. 找 `Security Lists`
6. 点 public subnet 对应的 security list

## 7. 增加入站规则

进入 `Security List` 后：

1. 找 `Ingress Rules`
2. 点 `Add Ingress Rules`

### 7.1 开 SSH 端口

填：

- `Source Type`: `CIDR`
- `Source CIDR`: `0.0.0.0/0`
- `IP Protocol`: `TCP`
- `Destination Port Range`: `22`

然后点 `Add Ingress Rules`

### 7.2 开网页端口

再加一条：

- `Source Type`: `CIDR`
- `Source CIDR`: `0.0.0.0/0`
- `IP Protocol`: `TCP`
- `Destination Port Range`: `80`

然后点 `Add Ingress Rules`

### 7.3 可选：开 Node 原始端口

如果你想先不装 Nginx，直接跑 Node，可以再加：

- `Source Type`: `CIDR`
- `Source CIDR`: `0.0.0.0/0`
- `IP Protocol`: `TCP`
- `Destination Port Range`: `8788`

正式长期用，我建议最后保留 `80`，不暴露 `8788`。

## 8. 现在你已经点完了

做到这里，你已经完成了：

- Oracle 免费实例创建
- 公网 IP 分配
- 端口开放

下一步就不是“点”，而是登录服务器执行命令。

你接下来直接看：

- [ORACLE_SERVER_COMMANDS.md](C:\Users\24951\Documents\Codex_66test\定投\ORACLE_SERVER_COMMANDS.md)

## 9. 登录服务器时怎么判断用户名

如果你镜像选的是：

- `Ubuntu`，用户名通常是 `ubuntu`
- `Oracle Linux`，用户名通常是 `opc`

示例：

```bash
ssh -i your-private-key ubuntu@你的公网IP
```

或者：

```bash
ssh -i your-private-key opc@你的公网IP
```

## 10. 如果创建时报没资源

这在 Oracle 免费层不稀奇。

你可以这样处理：

1. 换 `Shape`
2. 换 `Region`
3. 先试 `E2.1.Micro`
4. 再试 `A1.Flex`

不要在一个规格上死磕太久。

## 11. 你现在最该注意的事

点后台时最容易漏的是这三项：

1. `Assign a public IPv4 address`
2. `Ingress Rules` 放行 `22` 和 `80`
3. 私钥文件别丢

少了任意一个，后面都容易卡住。
