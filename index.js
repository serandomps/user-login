var dust = require('dust')();
var serand = require('serand');

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
        success.apply(null, Array.prototype.slice.call(arguments));
    };
    options.error = function (xhr, status, err) {
        error.apply(null, Array.prototype.slice.call(arguments));
    };
    ajax.call($, options);
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
        url: '/apis/v/tokens',
        headers: {
            'x-host': 'accounts.serandives.com'
        },
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
            if (done) {
                done();
            }
        },
        error: function (xhr) {
            console.log('token refresh error');
            if (done) {
                done(xhr);
            }
        }
    });
};

dust.loadSource(dust.compile(require('./template'), 'user-login'));

module.exports = function (sanbox, fn, options) {
    dust.render('user-login', {}, function (err, out) {
        if (err) {
            return;
        }
        sanbox.append(out);
        sanbox.on('click', '.user-login .login', function (e) {
            var el = $('.user-login');
            var username = $('.username', el).val();
            var password = $('.password', el).val();
            $.ajax({
                method: 'POST',
                url: '/apis/v/tokens',
                headers: {
                    'x-host': 'accounts.serandives.com'
                },
                data: {
                    grant_type: 'password',
                    username: username,
                    password: password
                },
                contentType: 'application/x-www-form-urlencoded',
                dataType: 'json',
                success: function (data) {
                    user = {
                        username: username,
                        access: data.access_token,
                        refresh: data.refresh_token,
                        expires: expires(data.expires_in)
                    };
                    localStorage.user = JSON.stringify(user);
                    console.log('login successful');
                    console.log('next refresh in : ' + Math.floor(next(user.expires) / 1000));
                    setTimeout(refresh, next(user.expires));
                    if (user) {
                        serand.emit('user', 'logged out');
                    }
                    serand.emit('user', 'logged in', user);
                },
                error: function () {
                    serand.emit('user', 'login error');
                }
            });
            return false;
        });
        fn(false, function () {
            sanbox.remove('.user-login');
        });
    });
};

serand.on('boot', 'init', function () {
    /*$.ajax({
     url: '/apis/user',
     contentType: 'application/json',
     dataType: 'json',
     success: function (data) {
     serand.emit('user', 'login', data);
     },
     error: function () {
     serand.emit('user', 'error');
     }
     });*/
});

serand.on('user', 'logout', function (usr) {
    $.ajax({
        method: 'DELETE',
        url: '/apis/v/tokens/' + user.access,
        headers: {
            'x-host': 'accounts.serandives.com'
        },
        dataType: 'json',
        success: function (data) {
            console.log('logout successful');
            user = null;
            localStorage.removeItem('user');
            serand.emit('user', 'logged out');
        },
        error: function () {
            console.log('logout error');
            serand.emit('user', 'logout error');
        }
    });
});

if (localStorage.user) {
    var usr = JSON.parse(localStorage.user);
    console.log(usr);
    var nxt = next(usr.expires);
    if (!nxt) {
        localStorage.removeItem('user');
        return;
    }
    user = usr;
    setTimeout(function () {
        console.log('next refresh in : ' + Math.floor(nxt / 1000));
        setTimeout(refresh, nxt);
        serand.emit('user', 'logged in', user);
        console.log('local storage user');
    }, 0);
}

/*

 setTimeout(function () {
 var serand = require('serand');
 serand.emit('user', 'login', { username: 'ruchira'});
 }, 4000);*/