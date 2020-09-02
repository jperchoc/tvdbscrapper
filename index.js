"use strict";
const fs = require('fs');
const cheerio = require("cheerio");
const request = require("request-promise")
const lineReader = require('line-reader');
const Promise = require('bluebird');

const DOWNLOADIMAGES = false;
const USEPROXY = true;

const siteUrl = "https://thetvdb.com"
const tvShowEpisodesList = "/series/one-piece/seasons/absolute/1";
const tvShowName = "One Piece"
if (USEPROXY) {
  request.defaults({
    proxy: "http://localhost:3128"//YOUR PROXY HERE
  });
}

async function parseTVShow() {
  let episodeList = await request({uri: siteUrl + tvShowEpisodesList, json: true});
  const $ = cheerio.load(episodeList);
  $('tr').each(async(index, tr) => {
    //On passe le premier tr (c'est le thead)
    if (tr.children[1].name === 'th') {
      return;
    }
    //Ensuite, on récupère le lien (3ème children)
    const episodeLink = tr.children[3].children[1].attribs.href;
    //On traite l'épisode
    await handleEpisode(siteUrl + episodeLink);
  });
}

async function handleEpisode(link) {
  let episodeInfos = {};
  let body = await request({uri: link, json: true});
  const $ = cheerio.load(body);
  episodeInfos.uniqueIdType = "tvdb";
  episodeInfos.uniqueId = link.split('/').pop();
  let crumbsLength = $('.crumbs').length;
  //Episode Number
  episodeInfos.episodeNumber = lpad(+$('.crumbs')[crumbsLength - 1].children[8].data.replace('/','').replace('Episode', '').trim(), 3);
  //Title & Desc
  $('.change_translation_text').each((index, div) => {
    //On ne garde que si l'attribut data-language est à "fra"
    if (div.attribs['data-language'] === 'fra') {
        episodeInfos.title = div.attribs['data-title'];
      try {
        episodeInfos.desc = div.children[1].children[0].data;
      } catch {
        episodeInfos.desc = "";
      }
    }
  });
  //Aired
  episodeInfos.aired = $('.list-group-item')[0].children[3].children[0].children[0].data;
  //Runtime
  episodeInfos.runtime = $('.list-group-item')[1].children[3].children[0].data.replace('minutes', '').trim();
  //Image
  try {
    episodeInfos.imageLink = $('.thumbnail')[0].attribs['href'];
  } catch {
    console.log('no imagelink found for episode' + episodeInfos.episodeNumber);
  }
  if (DOWNLOADIMAGES) {
    download(episodeInfos.imageLink, 'imgs/' + episodeInfos.episodeNumber + '.jpg', function(){
      console.log('Download ' + episodeInfos.episodeNumber + '.jpg finished.');
    })
  }
  //save as nfo
  const fileName = await findEpisodeName(episodeInfos.episodeNumber);
  fs.writeFile('nfos/' + fileName + '.nfo',toNfo(episodeInfos) , 'utf-8', function (err) {
    if (err) return console.log(err);
    //else console.log('Finished creating nfo for episode ' + episodeInfos.episodeNumber);
  });
}

async function findEpisodeName(number) {
  let episodename = number;
  var eachLine = Promise.promisify(lineReader.eachLine);
  await eachLine('list.txt', function(line) {
    let res = line.match(/(\D|^)([0-9]{3})(\D|$)/);
    if (res[2] === number) {
      episodename = line;
      console.log('Find name for episode ' + number + ': ' + episodename);
    }
  });
  return episodename;
}

function toNfo(episodeInfos) {
  return ""
  + "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n"
  + "<episodedetails>\r\n"
  + "    <title>" + episodeInfos.title + "</title>\r\n"
  + "    <showtitle>" + tvShowName + "</showtitle>\r\n"
  + "    <userrating></userrating>\r\n"
  + "    <season>1</season>\r\n"
  + "    <episode>" + episodeInfos.episodeNumber + "</episode>\r\n"
  + "    <thumb>" + episodeInfos.imageLink + "</thumb>\r\n"
  + "    <plot>" + episodeInfos.desc + "</plot>\r\n"
  + "    <runtime>" + episodeInfos.runtime + "</runtime>\r\n"
  + "    <uniqueid type=\"" + episodeInfos.uniqueIdType + "\" default=\"true\">" + episodeInfos.uniqueId + "</uniqueid>\r\n"
  + "    <aired>" + episodeInfos.aired + "</aired>\r\n"
  + "</episodedetails>";
}

function download(uri, filename, callback){
  request.head(uri, function(err, res, body){
    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
}

function lpad(value, padding) {
  var zeroes = new Array(padding+1).join("0");
  return (zeroes + value).slice(-padding);
}

parseTVShow();