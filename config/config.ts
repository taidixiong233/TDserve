interface Config {
    port: number,
    secret: string,
    database: {
        host: string,
        port: number,
        user: string,
        password: string,
        database: string
    },
    timeout: number,
    web_url: string,
}

const config:Config = {
    port: 8078,
    //
    secret: '你的secret',
    database: {
        host: '数据库ip',
        port: 3306,
        user: 'root',
        password: '密码',
        database: 'TDUI'
    },
    timeout: 86400000,
    web_url: 'http://192.168.0.110:8080'
}

export default config