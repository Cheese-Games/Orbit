# a game
a game by xtracube

i made this game for school and for fun

![Example](https://media.discordapp.net/attachments/816969327504392243/841344054632906762/unknown.png?width=300&height=150 "Example")

# Instructions to run your own custom game server

## Method 1: Deploy to Heroku
Just press the button below to deploy the server to heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

The server address will be the app name you set + `.herokuapp.com`

For example, if my app name was `super-cool-server`, the address would be `super-cool-server.herokuapp.com`

To connect to your server in game, just paste the address into the server field in-game and press join.

## Method 2: Manually

First make sure you have installed nodejs from [here](https://nodejs.org/en/download/current/)

Then follow these steps:

1. Clone the repo
```sh
git clone https://github.com/XtraCube/a-game.git
cd a-game
```
2. Install the npm packages
```sh
npm install
```
3. Compile and run
```sh
npm start
```
4. Copy your server's IP and port into the server field in-game and press join
