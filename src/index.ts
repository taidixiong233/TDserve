import { Client, createClient } from "oicq";
import express from 'express'
import bodyParser from 'body-parser'
import fs from 'fs'
import path from 'path'


import config from "../config/config";

export let clientMap: Map<number, Client> = new Map()

export const app = express()
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json())

app.listen(config.port, '0.0.0.0', () => console.log(`serve listen in ${config.port}`))

import './serve'
