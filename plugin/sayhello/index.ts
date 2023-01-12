import { Plugin } from '../'
import { Client } from 'oicq'

export const config : Plugin = {
    start(client_map:Client):void {
        setTimeout(() => {
            console.log(`来自${this.author}的插件${this.name} 版本${this.version} 已加载完毕！`)
            Setup(client_map)
        }, 10)
    },
    name : 'sayhello',
    author : 'taidixiong233',
    version : '1.0',
    website : 'maohaoji.com',
    start_filename : './sayhello/index.ts',
    uuid: 'ebfab24e-4e41-44f4-99d1-0aea34314b65',
    lib: []
}


function Setup(client:Client) {
    client.on('message.private', message => {
        if (message.sender.user_id == 2870926164)
    message.reply('Hello World!')
    })
}

