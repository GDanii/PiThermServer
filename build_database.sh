#!/bin/bash
#
# build_database.sh - create empty temperature database schema for to log temperature in.
#
# Tom Holderness 22/01/2012
sqlite3 piTemps.db 'DROP TABLE temperature_records;'
sqlite3 piTemps.db 'CREATE TABLE temperature_records(unix_time bigint primary key, celsius real, off_threshold real, on_threshold real, heating integer);' 

sqlite3 piTemps.db 'DROP TABLE settings;'
sqlite3 piTemps.db 'CREATE TABLE settings(name text primary key, value real);' 
sqlite3 piTemps.db 'INSERT INTO settings values ("enabled", 0);' 
sqlite3 piTemps.db 'INSERT INTO settings values ("on", 20);' 
sqlite3 piTemps.db 'INSERT INTO settings values ("off", 25);' 
sqlite3 piTemps.db 'INSERT INTO settings values ("alert", 1);' 

sqlite3 piTemps.db 'DROP TABLE auth;'
sqlite3 piTemps.db 'CREATE TABLE auth(id integer primary key, name text, password text);' 
# The user must be added with sha256 hashed password
# (require('crypto').createHash('sha256').update(PASSWORD).digest('hex');)