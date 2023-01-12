import { Client } from "oicq"
import fs from 'fs'
import path from 'path'

/**
 * 获取插件列表
 */
export function get_plugin_list(uin: number): Plugin_info[] {
    try {
        if (fs.existsSync(path.join(__dirname, './plugin.json')).toString()) {
            let data = JSON.parse(fs.readFileSync(path.join(__dirname, './plugin.json')).toString()).bot
            let all_plugin_list: Plugin_info[] = []

            for (let i of data) {
                if (i.uin == uin) {
                    for (let p of i.plugin) {
                        all_plugin_list.push(...get_lib_plugin(p))
                    }
                }

                let plugin_map: Map<string, Plugin_info> = new Map()
                for (let i of all_plugin_list) {
                    if (!plugin_map.has(i.uuid)) plugin_map.set(i.uuid, i)
                }
                let Plugin_list: Plugin_info[] = []
                for (let i of plugin_map) {
                    Plugin_list.push(i[1])
                }
                return Plugin_list
            }
            return []
        } else {
            return []
        }
    } catch {
        return []
    }
}

function Plugin_start(client: Client): Promise<any> {
    return new Promise(async (res) => {
        if (!fs.existsSync(path.join(__dirname, './plugin.json'))) {
            res({
                code: 800,
                msg: '找不到插件管理文件plugin.json'
            })
        } else {
            //尝试读取json
            try {
                let data = JSON.parse(fs.readFileSync(path.join(__dirname, './plugin.json')).toString()).bot
                let all_plugin_list: Plugin_info[] = []

                let success: string[] = []
                let error: string[] = []
                for (let i of data) {
                    if (i.uin == client.uin) {
                        for (let p of i.plugin) {
                            all_plugin_list.push(...get_lib_plugin(p))
                        }
                    }

                    let plugin_map: Map<string, Plugin_info> = new Map()
                    for (let i of all_plugin_list) {
                        if (!plugin_map.has(i.uuid)) plugin_map.set(i.uuid, i)
                    }

                    for (let i of plugin_map) {
                        if (!fs.existsSync(path.join(__dirname, i[1].start_filename))) {
                            error.push(`找不到插件${i[1].name}的入口文件`)
                        } else {
                            await import(path.join(__dirname, i[1].start_filename)).then(async plugin => {
                                plugin.config.start(client)
                                success.push(`插件${i[1].name}加载成功`)
                            }).catch(err => {
                                error.push(`插件${i[1].name}加载失败 ${err}`)
                            })
                        }
                    }
                    res({
                        code: 200,
                        error: error,
                        success: success
                    })
                }
                //没有找到配置
                res({
                    code: 802,
                    msg: '插件加载失败(没有找到机器人的配置)'
                })
            } catch {
                res({
                    code: 801,
                    msg: '插件加载失败(未知原因)'
                })
            }
        }
    })
}

/**
 * 解析插件依赖
 * @param plugin 需要解析的插件
 * @returns 解析好的插件依赖
 */
function get_lib_plugin(plugin: Plugin_info): Plugin_info[] {
    let list: Plugin_info[] = [{ ...plugin, lib: [] }]
    for (let i of plugin.lib) {
        list.push(...get_lib_plugin(i))
    }
    return list
}

export default Plugin_start


export const config: Plugin = {
    start(client_map: Map<number, Client>): void { },
    name: "TD-bot Plugin",
    author: "taidixiong233",
    version: "1.0",
    website: "maohaoji.com",
    start_filename: "./index.ts",
    uuid: "e807ac82-7765-4373-afec-1cbbd327dd73",
    lib: []
}

/**一个插件 */
export interface Plugin extends Plugin_info {
    /**插件入口 */
    start(client_map?: Map<number, Client> | Client): void,
}
/**插件信息 */
export interface Plugin_info {
    name: string,
    author: string,
    version: string,
    website: string,
    uuid: string,
    start_filename: string,
    lib: Plugin_info[]
}
