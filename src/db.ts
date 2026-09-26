import mysql from 'mysql2/promise'

export default db= mysql.createPool({
host:'localhost',
user:'root',
password:'',
database:'chatdb'

});


