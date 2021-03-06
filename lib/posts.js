'use strict';

var level = require('level');
var Boom = require('boom');
var concat = require('concat-stream');
var twitter = require('twitter-text');
var moment = require('moment');
var nconf = require('nconf');

var services = require('./services');
var utils = require('./utils');

nconf.argv().env().file({ file: 'local.json' });

var db = level('./db/posts', {
  createIfMissing: true,
  valueEncoding: 'json'
});

var getTime = function () {
  return Math.floor(Date.now() / 1000);
};

exports.db = function () {
  return db;
};

exports.add = function (request, reply) {
  var time = getTime();

  var postItem = {
    uid: request.session.get('uid'),
    name: request.session.get('name'),
    created: time,
    content: twitter.autoLink(twitter.htmlEscape(request.payload.content))
  };

  db.put('user!' + request.session.get('uid') + '!' + time, postItem, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    db.put('post!' + time, postItem, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      reply.redirect('/posts');
    });
  });
};

var setDate = function (created) {
  return moment(created * 1000).format('MMM Do, YYYY');
};

exports.getAllRecent = function (request, reply) {
  var rs = db.createReadStream({
    gte: 'post!',
    lte: 'post!\xff',
    limit: 10,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    return reply.view('discover', {
      analytics: nconf.get('analytics'),
      session: request.session.get('uid'),
      posts: posts.map(function (post) {
        post.value.created = setDate(post.value.created);
        return post;
      })
    });
  }));

  rs.on('error', function (err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.getRecent = function (request, reply) {
  var uid = request.session.get('uid');

  var rs = db.createReadStream({
    gte: 'user!' + uid,
    lt: 'user!' + uid + '!\xff',
    limit: 10,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    return reply.view('posts', {
      analytics: nconf.get('analytics'),
      session: request.session.get('uid'),
      posts: posts.map(function (post) {
        post.value.created = setDate(post.value.created);
        return post;
      })
    });
  }));

  rs.on('error', function (err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.getRecentForUser = function (uid, next) {
  var rs = db.createReadStream({
    gte: 'user!' + uid,
    lt: 'user!' + uid + '!\xff',
    limit: 10,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    next(null, posts.map(function (post) {
      post.value.created = setDate(post.value.created);
      return post;
    }));
  }));

  rs.on('error', function (err) {
    next(err);
  });
};

exports.del = function (request, reply) {
  if (request.session && request.session.get('uid') === request.payload.uid) {
    var keyArr = request.params.key.split('!');
    var time = keyArr[keyArr.length - 1];
    db.del('post!' + time, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      db.del('user!' + request.session.get('uid') + '!' + time);
      reply.redirect('/posts');
    });
  } else {
    reply.redirect('/');
  }
}

exports.get = function (request, reply) {
  db.get(request.params.key, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    post.created = setDate(post.created);

    reply.view('post', {
      analytics: nconf.get('analytics'),
      id: request.params.key,
      session: request.session.get('uid') || false,
      post: post
    });
  });
};
