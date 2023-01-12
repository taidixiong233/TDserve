import { app, clientMap } from ".";
import mysql from 'mysql'
import jsonwebtoken from 'jsonwebtoken'
import { Client, createClient } from "oicq";
import config from "../config/config";
import Plugin_start from "../plugin";
import fs from 'fs'
import path from 'path'
import { get_plugin_list } from '../plugin'
import os from 'os'


//#region 登录接口 /login
/**
 * /login 登录接口
 *  参数:   username    用户名
 *          password    用户密码的md5
 *  返回:   code        代码
 *          msg         描述
 *          data        数据库错误时的错误信息
 *          user_data   用户数据  
 *          end_time    被ban至
 *  代码描述:
 *      201 参数错误
 *      200 登录成功
 *      603 密码错误
 *      602 用户不存在
 *      604 用户被禁止登录
 */
app.post('/login', (req, res) => {
    const { username, password } = req.body
    if (!username || !password) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    getuser(username, false).then(user => {
        if (user.password == password) {
            //检查用户是否被ban
            if (user.userlevel == '被禁用') {
                res.json({
                    code: 604,
                    msg: '用户被禁止登录',
                    end_time: ts2string(Number(user.userlevel_ts))
                })
            } else {
                res.json({
                    code: 200,
                    token: jsonwebtoken.sign(makeTokenData(user), config.secret),
                    user_data: {
                        ...makeExportUserData(user),
                        ip: req.ip
                    }
                })
                let sql = mysql.createPool(config.database)
                sql.query({ sql: `UPDATE user SET ip = '${req.ip}' WHERE useruuid='${user.useruuid}'` }, (err) => {
                    sql.end()
                    if (err) console.log(err)
                })
            }
            return
        } else {
            res.json({
                code: 603,
                msg: '密码错误'
            })
            return
        }
    }).catch((err) => {
        if (err) {
            res.json({ ...err })
        }
    })
})
//#endregion

//#region 获取用户信息 /getuserinfo
/**
 * /getuserinfo 获取用户信息
 *  参数:   useruuid    用户uuid
 *  返回:   code        代码
 *          msg         描述
 *          data        数据库错误时的错误信息
 *          user_data   用户数据  
 *  代码描述:
 *      201 参数错误
 *      200 登录成功
 *      603 密码错误
 *      602 用户不存在
 *      605 安全风险,请重新登录
 */
app.post('/getuserinfo', (req, res) => {
    let token = getToken(req.headers)

    checkToken(token).then(data => {
        if (data.ip != req.ip) {
            res.json({
                code: 605,
                msg: '安全风险,请重新登录'
            })
            return
        } else {
            getuser(data.useruuid).then(data => {
                res.json({
                    code: 200,
                    user_data: makeExportUserData(data)
                })
                return
            }).catch(err => {
                res.json({ ...err })
                return;
            })
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 查询机器人信息 /getBotInfo
/**
 * /getBotInfo 查询机器人信息
 *  头部携带token
 *  参数:   uin         官方机器人的qq号
 *  返回:   code        代码
 *          msg         描述
 *          data        数据库错误时的错误信息
 *          user_data   用户数据  
 *          end_time    被ban至
 *  代码描述:
 *      201 参数错误
 *      200 登录成功
 *      603 密码错误
 *      602 用户不存在
 *      604 用户被禁止登录
 */
app.post('/getBotInfo', (req, res) => {
    const { uin } = req.body
    if (!uin) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(data => {
        getBotInfo(uin, data.useruuid).then(bot => {
            res.json({
                code: 200,
                data: bot
            })
            return
        }).catch(err => res.json({ ...err }))
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 添加自定义机器人 /addmybot
app.post('/addmybot', (req, res) => {
    const { bot_uin, bot_pwd } = req.body
    if (!bot_uin || !bot_pwd || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(async data => {
        if (clientMap.has(Number(bot_uin))) {
            res.json({
                code: 606,
                msg: '机器人已经存在'
            })
            return
        } else {
            let client = createClient(bot_uin, { platform: 5 })
            clientMap.set(Number(bot_uin), client)
            setTimeout(() => editdevicejson(bot_uin), 200)

            res.json({
                code: 200,
                msg: '机器人添加成功'
            })
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 登录机器人 /loginbot
app.post('/loginbot', (req, res) => {
    const { bot_uin, bot_pwd } = req.body
    if (!bot_uin || !bot_pwd || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(async data => {
        if (!clientMap.has(Number(bot_uin))) {
            res.json({
                code: 607,
                msg: '机器人不存在'
            })
            return
        } else {
            let client = clientMap.get(Number(bot_uin)) as Client
            await client.login(bot_pwd)
            botevent(client).then(event => {
                if (event.code == 200) {
                    //加载插件
                    Plugin_start(client).then(msg => {
                        res.json(msg)
                        return
                    }).catch(err => {
                        res.json({ ...err })
                        return
                    })
                } else {
                    res.json({ ...event })
                    return
                }

            }).catch(err => {
                console.log(err)
            })
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})

//#endregion

//#region 提交ticket /ticket
app.post('/ticket', (req, res) => {
    const { ticket, bot_uin } = req.body
    if (!ticket || !bot_uin || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(data => {
        if (!clientMap.has(Number(bot_uin))) {
            res.json({
                code: 607,
                msg: '机器人不存在'
            })
            return
        } else {
            let client = clientMap.get(Number(bot_uin)) as Client
            client.submitSlider(ticket)
            botevent(client).then(event => {
                if (event.code == 200) {
                    //加载插件
                    Plugin_start(client).then(msg => {
                        res.json(msg)
                        return
                    }).catch(err => {
                        res.json({ ...err })
                        return
                    })
                } else {
                    res.json({ ...event })
                    return
                }
            }).catch(e => console.log(e))
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 登出机器人 /logoutbot

app.post('/logoutbot', (req, res) => {
    const { bot_uin } = req.body
    if (!bot_uin) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(async data => {
        if (!clientMap.has(Number(bot_uin))) {
            res.json({
                code: 607,
                msg: '机器人不存在'
            })
            return
        } else {
            let client = clientMap.get(Number(bot_uin)) as Client
            await client.logout(false)
            res.json({
                code: 200
            })
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})

//#endregion

//#region 删除机器人 /removebot
app.post('/removebot', (req, res) => {
    const { bot_uin } = req.body
    if (!bot_uin) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(async data => {
        if (!clientMap.has(Number(bot_uin))) {
            res.json({
                code: 607,
                msg: '机器人不存在'
            })
            return
        } else {
            (clientMap.get(Number(bot_uin)) as Client).logout(false)
            clientMap.delete(Number(bot_uin))
            res.json({
                code: 200
            })
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})

//#endregion

//#region 提交短信验证码 /smscode
app.post('/smscode', (req, res) => {
    const { code, bot_uin } = req.body
    if (!code || !bot_uin || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(data => {
        if (!clientMap.has(bot_uin)) {
            res.json({
                code: 607,
                msg: '机器人不存在'
            })
            return
        } else {
            let client = clientMap.get(bot_uin) as Client
            client.submitSmsCode(code)
            botevent(client).then(event => {
                if (event.code == 200) {
                    //加载插件
                    Plugin_start(client).then(msg => {
                        res.json(msg)
                        return
                    }).catch(err => {
                        res.json({ ...err })
                        return
                    })
                } else {
                    res.json({ ...event })
                    return
                }
            }).catch(e => console.log(e))
        }
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 获取指定机器人的插件信息 /getpluginlist
app.post('/getpluginlist', (req, res) => {
    const { bot_uin } = req.body
    if (!bot_uin || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(data => {
        getBotInfo(bot_uin, data.useruuid).then(bot => {
            res.json({
                code: 200,
                data: get_plugin_list(bot_uin)
            })
        }).catch(err => {
            res.json(err)
            return
        })

    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 获取机器人状态信息 /getBotStatus
app.post('/getBotStatus', (req, res) => {
    const { bot_uin } = req.body
    if (!bot_uin || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(data => {
        getBotInfo(bot_uin, data.useruuid).then(bot => {
            if (clientMap.has(Number(bot.bot_uin))) {
                let data: string = ''
                switch ((clientMap.get(Number(bot_uin)) as Client).status) {
                    case 11:
                        data = '在线'
                        break;
                    case 31:
                        data = '缺省'
                        break
                    case 41:
                        data = '隐身'
                        break;
                    case 50:
                        data = '忙碌'
                        break;
                    case 60:
                        data = 'Q我吧'
                        break;
                    case 70:
                        data = '请勿打扰'
                        break;
                    default:
                        data = '未登录'
                        break
                }
                res.json({
                    code: 200,
                    data: data
                })
                return
            } else {
                res.json({
                    code: 200,
                    data: '未登录'
                })
                return
            }
        }).catch(err => {
            res.json(err)
            return
        })

    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 获取机器人统计数据 /getbotstate
app.post('/getbotstate', (req, res) => {
    const { bot_uin } = req.body
    if (!bot_uin || bot_uin != Number(bot_uin)) {
        res.json({
            code: 201,
            data: '参数错误'
        })
        return;
    }
    checkToken(getToken(req.headers)).then(data => {
        getBotInfo(bot_uin, data.useruuid).then(bot => {
            if (clientMap.has(Number(bot_uin))) {
                res.json({
                    code: 200,
                    data: (clientMap.get(Number(bot_uin)) as Client).stat
                })
            } else {
                res.json({
                    code: 200,
                    data: '未登录'
                })
            }
        }).catch(err => {
            res.json(err)
            return
        })

    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 获取服务器固定信息 /getdeviceinfo
app.post('/getdeviceinfo', (req, res) => {
    checkToken(getToken(req.headers)).then(data => {
        let info: DeviceInfo = {
            cpu: {
                model: os.cpus()[0].model,
                number: os.cpus().length,
                speed: os.cpus()[0].speed
            },
            system: {
                type: os.type(),
                version: os.release(),
                arch: os.arch(),
            },
            mem: {
                free: os.freemem(),
                total: os.totalmem()
            }
        }

        res.json({
            code: 200,
            data: info
        })
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 获取服务器实时信息 /getdeviceinfo_e
app.post('/getdeviceinfo_e', (req, res) => {
    checkToken(getToken(req.headers)).then(data => {
        getCPUUsage(800).then(data => {
            let deviceInfo_Effectiveness: DeviceInfo_Effectiveness = {
                cpu_speed: (function (): number[] {
                    let arr: number[] = []
                    for (let i of os.cpus()) {
                        arr.push(i.speed)
                    }
                    return arr
                }()),
                cpu_load: data,
                free_mem: os.freemem()
            }
            res.json({
                code: 200,
                data: deviceInfo_Effectiveness
            })
        })
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})
//#endregion

//#region 查询我的机器人 /querymybot 
app.post('/querymybot', (req, res) => {
    checkToken(getToken(req.headers)).then(data => {
        getuser(data.useruuid).then(user => {
            res.json({
                code: 200,
                data: makeBaseBot(JSON.parse(user.m_bot as unknown as string))
            })
            return
        }).catch(err => {
            res.json(err)
        })
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})

//#endregion

//#region 查询官方机器人 /querybot 
app.post('/querybot', (req, res) => {
    checkToken(getToken(req.headers)).then(data => {
        getuser(data.useruuid).then(user => {
            res.json({
                code: 200,
                data: JSON.parse(user.o_bot as unknown as string)
            })
        }).catch(err => {
            res.json(err)
        })
    }).catch(() => {
        res.json({
            code: 403,
            msg: '鉴权失败'
        })
        return;
    })
})

//#endregion

/**
 * 获取一个用户实例
 * @param userid 用户的username 或者 nameuuid
 * @param uuid 第一项是否为useruuid
 * @returns 用户实例 
 */
function getuser(userid: string, uuid = true): Promise<User> {
    return new Promise((res, rej) => {
        let sql = mysql.createPool(config.database)
        sql.query({ sql: `SELECT * FROM user WHERE ${uuid ? 'useruuid' : 'username'}='${userid}'` }, (err, row) => {
            sql.end()
            if (err) rej({ code: 202, data: err, msg: '数据库错误' })
            if (row.length <= 0) rej({ code: 602, data: '没有找到用户' })
            res(row[0])
        })
    })
}

function botevent(client: Client): Promise<any> {
    return new Promise((res) => {
        client.on('system.login.slider', e => {
            res({
                code: 701,
                msg: '收到滑动验证码',
                url: e.url
            })
            return;
        })

        client.on('system.login.device', e => {
            client.sendSmsCode()
            res({
                code: 702,
                url: e.url,
                msg: '遇到设备锁'
            })
            return;
        })

        client.on('system.login.qrcode', e => {
            res({
                code: 703,
                data: e.image.toString(),
                msg: '收到二维码'
            })
            return;
        })

        client.on('system.login.error', e => {
            res({
                code: Number(String(704) + String(e.code)),
                msg: e.message
            })
            return;
        })

        client.on('system.online', () => {
            res({
                code: 200
            })
            return
        })

        client.on('system.offline.kickoff', e => {
            res({
                code: 705,
                msg: e.message
            })
            return
        })

        client.on('system.offline.network', e => {
            res({
                code: 706,
                msg: '网络繁忙'
            })
            return
        })
    })

}

/**
 * 制作token的数据
 * @param user 用户实例
 * @returns 制作好的Token数据
 */
function makeTokenData(user: Token_data): Token_data
function makeTokenData(user: User): Token_data
function makeTokenData(user: User | Token_data): Token_data {
    return {
        username: user.username,
        useruuid: user.useruuid,
        reg_ts: user.reg_ts,
        ip: user.ip,
        qid: user.qid
    }
}

/**
 * 从头部提出jwt
 * @param headers 请求头部
 * @returns 处理好的jwt
 */
function getToken(headers: any): string {
    try {
        return (headers.authorization as string).split(' ')[1]
    } catch {
        return ''
    }
}


/**
 * 制作直接返回给前端的用户数据
 * @param user 用户实例
 * @returns 制作好的数据
 */
function makeExportUserData(user: User): Export_User_data {
    return {
        ...makeTokenData(user),
        userlevel: user.userlevel,
        userlevel_ts: user.userlevel_ts,
        usermoney: user.usermoney
    }
}
/**
 * 将毫秒级时间戳转为字符串
 * @param ts 要转换的时间戳
 * @returns 转换好的字符串
 */
function ts2string(ts: number): string {
    let time = new Date(ts)
    return `${time.getFullYear()}年${time.getMonth() + 1}月${time.getDate()}日 ${time.getHours()}时${time.getMinutes()}分${time.getSeconds()}秒`
}

function checkToken(token: string): Promise<Token_data> {
    return new Promise((res, rej) => {
        jsonwebtoken.verify(token, config.secret, (err, data) => {
            if (err) {
                rej()
            } else if (new Date().getTime() - (data as any).iat * 1000 < config.timeout) {
                res(data as any)
            } else {
                rej()
            }
        })
    })
}

/**
 * 查询某用户的机器人信息
 * @param bot_uin 机器人的uin
 * @param useruuid 用户实例
 * @returns 机器人信息
 */
function getBotInfo(bot_uin: number, user: User): Promise<Base_MyBot | OfficialBot>
/**
 * 查询某用户的机器人信息
 * @param bot_uin 机器人的uin
 * @param useruuid 用户的uuid
 * @returns 机器人信息
 */
function getBotInfo(bot_uin: number, user: string): Promise<Base_MyBot | OfficialBot>
function getBotInfo(bot_uin: number, user: string | User): Promise<Base_MyBot | OfficialBot> {
    return new Promise((res, rej) => {
        if (typeof user == 'string') {
            getuser(user).then(user => {
                for (let p of JSON.parse(String(user.m_bot))) {
                    if (p.bot_uin = bot_uin) res({
                        bot_uin: p.bot_uin,
                        start_ts: p.start_ts,
                        end_ts: p.end_ts,
                        type: p.type,
                        type_end_ts: p.type_end_ts,
                        id: p.id,
                        plugin: p.plugin
                    })
                }
                for (let p of JSON.parse(String(user.o_bot))) {
                    if (p.bot_uin == bot_uin) res(p)
                }
                rej({
                    code: 601,
                    msg: '没有找到机器人'
                })
            }).catch(err => rej(err))
        } else {
            for (let p of user.m_bot) {
                if (p.bot_uin = bot_uin) res(p)
            }
            for (let p of user.o_bot) {
                if (p.bot_uin == bot_uin) res(p)
            }
            rej({
                code: 601,
                msg: '没有找到机器人'
            })
        }
    })


}

/**
 * 删除机器人原始数据中的密码
 * @param bot 机器人原始数据
 * @returns 制作好的数据
 */
function makeBaseBot(bot: MyBot[]): Base_MyBot[] {
    let bot_arr: Base_MyBot[] = []
    for (let i of bot) {
        bot_arr.push({
            /** 机器人QQ */
            bot_uin: i.bot_uin,
            /**机器人添加时间 */
            start_ts: i.end_ts,
            /**机器人过期时间 */
            end_ts: i.end_ts,
            /**机器人套餐类型 */
            type: i.type,
            /**机器人套餐持续时间至 */
            type_end_ts: i.type_end_ts,
            /**机器人订单号 */
            id: i.id,
            /**机器人使用的插件uuid */
            plugin: i.plugin
        })
    }
    return bot_arr
}


/**修改oicq生成的设备文件 */
function editdevicejson(uin: number): void {
    try {
        if (fs.existsSync(path.join(__dirname, './data/', String(uin), 'device-' + uin + '.json'))) {
            let a = fs.readFileSync(path.join(__dirname, './data/', String(uin), 'device-' + uin + '.json')).toString()
            let device = JSON.parse(a)
            if (Number(device.imei) < 100015053101157) device.imei = String(Number(device.imei) + 865315053777157)
            device.imei = String(Number(device.imei) - 5234123)
            if (Number(device.incremental) < 1000001946) device.incremental = device.incremental + 9840531946
            device.incremental -= 342341
            fs.writeFileSync(path.join(__dirname, './data/', String(uin), 'device-' + uin + '.json'), JSON.stringify(device))
        }
    } catch (err) {
        console.log(err)
    }
}


/**token里包含的数据(公开数据) */
interface Token_data {
    /**用户名 */
    username: string,
    /**用户唯一标识 */
    useruuid: string,
    /**用户注册时间 */
    reg_ts: number,
    /**用户上次登录的ip */
    ip: string,
    /**绑定的qq */
    qid: number
}

/**前端所需的数据 */
interface Export_User_data extends Token_data {
    /**
     * 用户权限
     * 
     * 普通用户
     * 代理用户
     * 站长
     * 被禁用
     * 不存在
     */
    userlevel: string,
    /**用户权限持续时间至 */
    userlevel_ts: number,
    /**用户余额 */
    usermoney: string,
}

/**一个用户 */
interface User extends Export_User_data {
    /**用户密码 */
    password: string,
    /**用户使用的官方机器人 */
    o_bot: OfficialBot[],
    /**用户自己添加的机器人 */
    m_bot: MyBot[]
}

/**一个官方机器人 */
interface OfficialBot {
    /** 机器人QQ */
    bot_uin: number,
    /**机器人添加时间 */
    start_ts: number,
    /**机器人过期时间 */
    end_ts: number,
    /**机器人套餐类型 */
    type: 'free' | string,
    /**机器人订单号 */
    id: string,
    /**机器人套餐持续时间至 */
    type_end_ts: number,
    /**机器人使用的插件uuid */
    plugin: string[]
}

/**一个自己的机器人 */
interface MyBot extends Base_MyBot {
    /**机器人密码 */
    bot_pwd: string,
}

/**可以对外公布的自己的机器人 */
interface Base_MyBot {
    /** 机器人QQ */
    bot_uin: number,
    /**机器人添加时间 */
    start_ts: number,
    /**机器人过期时间 */
    end_ts: number,
    /**机器人套餐类型 */
    type: 'free' | string,
    /**机器人套餐持续时间至 */
    type_end_ts: number
    /**机器人订单号 */
    id: string,
    /**机器人使用的插件uuid */
    plugin: string[]
}

/**服务器固定的设备信息 */
interface DeviceInfo {
    cpu: {
        model: string,
        number: number,
        speed: number
    },
    system: {
        type: string,
        version: string,
        arch: string
    },
    mem: {
        free: number,
        total: number
    }

}

/**
 * 获取某时间段 CPU 利用率
 * @param timeout 延时
 * @returns cpu利用率的百分比字符串
 */
async function getCPUUsage(timeout: number = 800): Promise<string> {
    let os = require('os')
    let _getCPUInfo = (): {
        user: number,
        sys: number,
        idle: number,
        total: number
    } => {
        const cpus = os.cpus();
        let user = 0, nice = 0, sys = 0, idle = 0, irq = 0, total = 0;

        for (let cpu in cpus) {
            const times = cpus[cpu].times;
            user += times.user;
            nice += times.nice;
            sys += times.sys;
            idle += times.idle;
            irq += times.irq;
        }

        total += user + nice + sys + idle + irq;

        return {
            user,
            sys,
            idle,
            total,
        }
    }
    return new Promise(async (res, rej) => {
        const t1 = _getCPUInfo(); // t1 时间点 CPU 信息

        await sleep(timeout);

        const t2 = _getCPUInfo(); // t2 时间点 CPU 信息
        const idle = t2.idle - t1.idle;
        const total = t2.total - t1.total;
        let usage = 1 - idle / total;
        res((usage * 100.0).toFixed(2) + "%")
    })

}
/**
 * 延时函数
 * @param ms 延时的毫秒数
 * @returns 
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 服务器设备实时信息 */
interface DeviceInfo_Effectiveness {
    cpu_speed: number[],
    cpu_load: string,
    free_mem: number
}