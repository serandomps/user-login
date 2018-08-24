var dust = require('dust')();
var serand = require('serand');
var utils = require('utils');

var REFRESH_BEFORE = 10 * 1000;

var user;

var send = XMLHttpRequest.prototype.send;

var ajax = $.ajax;

var fresh = false;

var pending = false;

var queue = [];

$.ajax = function (options) {
    var success = options.success;
    var error = options.error;
    options.success = function (data, status, xhr) {
        if (xhr.status === 401) {
            if (!fresh) {
                console.log('transparently retrying unauthorized request');
                pending = true;
                refresh(function (err) {
                    fresh = true;
                    pending = false;
                    options.success = success;
                    options.error = error;
                    $.ajax(options);
                });
                return;
            }
            if (pending) {
                queue.push({
                    options: options,
                    success: success,
                    error: error
                });
                return;
            }
        }
        if (!success) {
            return;
        }
        success.apply(null, Array.prototype.slice.call(arguments));
    };
    options.error = function (xhr, status, err) {
        if (!error) {
            return;
        }
        error.apply(null, Array.prototype.slice.call(arguments));
    };
    return ajax.call($, options);
};

XMLHttpRequest.prototype.send = function () {
    if (user) {
        this.setRequestHeader('Authorization', 'Bearer ' + user.access);
    }
    send.apply(this, Array.prototype.slice.call(arguments));
};

var expires = function (expin) {
    return new Date().getTime() + expin - REFRESH_BEFORE;
};

var next = function (expires) {
    var exp = expires - new Date().getTime();
    return exp > 0 ? exp : null;
};

var refresh = function (done) {
    $.ajax({
        method: 'POST',
        url: utils.resolve('accounts:///apis/v/tokens'),
        data: {
            grant_type: 'refresh_token',
            refresh_token: user.refresh
        },
        contentType: 'application/x-www-form-urlencoded',
        dataType: 'json',
        success: function (data) {
            user = {
                username: user.username,
                access: data.access_token,
                refresh: data.refresh_token,
                expires: expires(data.expires_in)
            };
            localStorage.user = JSON.stringify(user);
            console.log('token refresh successful');
            console.log('next refresh in : ' + Math.floor(next(user.expires) / 1000));
            setTimeout(refresh, next(user.expires));
            done(null, data);
        },
        error: function (xhr, status, err) {
            console.log('token refresh error');
            done(err || status || xhr);
        }
    });
};

dust.loadSource(dust.compile(require('./template'), 'user-login'));

module.exports = function (sanbox, options, done) {
    dust.render('user-login', {}, function (err, out) {
        if (err) {
            return done(err);
        }
        sanbox.append(out);
        sanbox.on('click', '.user-login .login', function (e) {
            var el = $('.user-login');
            var username = $('.username', el).val();
            var password = $('.password', el).val();
            serand.emit('user', 'authenticate', username, password);
            return false;
        });
        done(null, function () {
            sanbox.remove('.user-login');
        });
    });
};
