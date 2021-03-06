/*
 * 弹幕类 ("▔□▔)")
 * 
 */
var DANMAKU_LIST = []; // 全部弹幕队列
var RUNNING_LIST = []; // 正在屏幕上显示的弹幕队列
var DANMAKU_LAST_POS  = 0;
var DANMAKU_LAST_TIME = 0;
var DANMAKU_POOL = {'scroll': [], 'top': [], 'bottom': [], 'reverse': []}; // 弹幕池


/*
 * 创建一个弹幕实例
 *
 */
var DANMAKU = function( opt, time ) {
    var self = this;
    // 由设置传入的参数
    this.id          = opt['id'];
    this.text        = opt['text'];
    this.stime       = opt['stime'];
    this.size        = opt['size'];
    this.color       = d2h(opt['color']);
    this.mode        = opt['mode'];
    this.date        = opt['date'];
    this.hash        = opt['hash'];
    this.isNew       = (opt['isNew'] && (opt['mode'] < 7)) ? true : false;
    this.opacity     = GLOBAL_CONFIG.opacity;
    this.font        = GLOBAL_CONFIG.font;
    this.lt          = GLOBAL_CONFIG.danmaku_life_time;

    // 检查是否被过滤！
    var content_filter_list = CONTENT_FILTER_LIST,
        fl = content_filter_list.length;
    for( var i = 0; i < fl; i++ ) {
        // 纯文本直接查找是否包含
        if( typeof content_filter_list[i] == 'string' ) {
            if( this.text.indexOf(content_filter_list[i]) >= 0 )
                return false;
        } else
        // 正则的话匹配一下试试
        if( typeof content_filter_list[i] == 'object' ) {
            if( content_filter_list[i].test(this.text))
                return false;
        }
    }

    // 生成文本节点！
    this.dom = document.createElement('div');
    this.dom.className = 'danmaku';
    this.dom.innerHTML = this.text;
    this.dom.style.color = this.color;
    this.dom.style.fontSize = this.size + 'px';
    this.dom.style.fontFamily = this.font;
    this.dom.style.opacity = this.opacity;
    // 带上弹幕id和发布者id，用于屏蔽
    this.dom.setAttribute('did', this.id);
    this.dom.setAttribute('uid', this.hash);
    // 自己发的弹幕会带边框
    if( this.isNew ) 
        this.dom.style.boxShadow = '0 0 0 1px ' + this.color + ', 0 0 0 2px rgba(0, 0, 0, .75)';

    // 接管右键菜单
    this.dom.addEventListener('contextmenu', DANMAKU.contextmenu);

    // 带上响应的特殊class
    this.className = 'danmaku ';

    // 是否开启全局隐藏弹幕模式
    if( GLOBAL_CONFIG.hide_danmaku ) this.className += 'hide ';

    // 是否在DEBUG模式中
    if( GLOBAL_CONFIG.debug ) this.className += 'debug ';

    // 带上弹幕类别class
    switch( this.mode ) {
        case 1 :
        case 6 : this.className += 'scrollDanmaku'; break;
        case 4 : this.className += 'bottomDanmaku'; break;
        case 5 : this.className += 'topDanmaku'; break;
        case 7 : this.className += 'specialDanmaku'; break;
    }
    this.dom.className = this.className;

    // 高级弹幕专用
    if( this.mode >= 7 ) {
        this.opacityFrom       = opt['opacityFrom'];
        this.opacityTo         = opt['opacityTo'];
        this.opacity           = this.opacityFrom;
        // 重新给DOM节点赋一次opacity
        this.dom.style.opacity = this.opacity;
        this.isMove            = opt['isMove'];
        this.moveDuration      = opt['moveDuration'];
        this.moveDelay         = opt['moveDelay'];
        this.toX               = opt['toX'];
        this.toY               = opt['toY'];
        // 特殊弹幕自带坐标，不需要setPosition来定位！
        this.x                 = opt['x'];
        this.y                 = opt['y'];
        // 高级弹幕有自带的生存时间，为0时永远显示
        this.lt                = opt['lifeTime'] === 0 ? 999999999 : opt['lifeTime'];
        // 检查是否有自定义字体
        if( opt['font'] ) {
            this.font = opt['font'];
            this.dom.style.fontFamily = this.font;
        }

        // 如果有rotate效果
        this.rY = opt.rY;
        this.rZ = opt.rZ;
        if( opt.rY != 0 || opt.rZ != 0 ) {
            this.dom.style.webkitTransformOrigin = "0% 0%";
            this.dom.style.webkitTransform = "rotateY(" + opt.rY + "deg) rotateZ(" + opt.rZ + "deg)";
        }
        // 如果弹幕君设置了是否描边就根据他的设置来
        if( opt['stroke'] === false ) {
            this.dom.style.textShadow = 'none';
        }
    }

    // 插入文本节点
    stage.dom.appendChild(this.dom);

    // 宽高必须在生成DOM后才能获取
    this.width = this.dom.offsetWidth;
    this.height = this.dom.offsetHeight;
    // 然后得把高宽写回dom上，不然它撑不起来
    this.dom.style.width = this.width + 'px';
    this.dom.style.height = this.height + 'px';

    // speed其实是scroll弹幕才用得到的，其他模式的弹幕都有自己的定位计算方法
    this.speed = (stage.width + this.width) / this.lt;

    // 为这条弹幕分配坐标
    this.setPosition();    

    // 加入RUNNING_LIST
    RUNNING_LIST.push(this);

    // 在弹幕列表中给这条弹幕加个激活状态
    if( !this.isNew ) {
        var li = document.querySelector('#d' + this.id);
        li.className = 'active';
    }

    // 记录创建时间
    this.ctime = this.lastTime = time;
}

/*
 * 设置弹幕位置
 * 
 */
DANMAKU.prototype.setPosition = function() {
    // 调用每种弹幕各自的定位方法
    switch( this.mode ) {
        case 1 : // 正向滚动弹幕初始时放在屏幕右侧以外
                this.x = stage.width;
                this.ScrollDanmaku( DANMAKU_POOL['scroll'], 0 );
                break;
        case 4 : // 顶部/底部固定弹幕居中
                this.x = (stage.width - this.width)/2;
                this.BottomDanmaku( DANMAKU_POOL['bottom'], 0 );
                break;
        case 5 : 
                this.x = (stage.width - this.width)/2;
                this.TopDanmaku( DANMAKU_POOL['top'], 0 );
                break;
        case 6 : // 逆向弹幕放在屏幕左侧以外
                this.x = -this.width;
                this.ReverseDanmaku( DANMAKU_POOL['reverse'], 0 );
                break;
        case 7 : // 高级弹幕，自带坐标，不需要我们来计算
                break;
    }
    // 将弹幕放置到初始位置上
    this.dom.style.left = this.x + 'px';
    this.dom.style.top = this.y + 'px';
}

/*
 * 弹幕实例每帧的逻辑运算
 *
 */
DANMAKU.prototype.frame = function() {
    var time = TIME,
        timePassed = time - this.ctime;
    // 检查弹幕生存时间是否结束
    // 因为弹幕并不是都会移动的，所以只有用生存时间来检测越界
    if( timePassed > this.lt ) {
        this.remove();
    }

    // 全局滤镜
    for( var i = 0; i < DANMAKU.filter.length; i++ ) {
        DANMAKU.filter[i](this);
    }

    // 在DEBUG模式下显示对象属性到DOM上
    this.displayProperty();

    // 根据弹幕类别来决定action
    switch( this.mode ) {
        case 1 : // 水平移动
                this.x -= this.speed * ( time - this.lastTime );
                this.dom.style.left = this.x + 'px';
                this.dom.style.top =  this.y + 'px';
                break;
        case 4 : // bottom弹幕有一条消失时把其余弹幕向下移动，顶到边界
                if( this.y < this.toY ) {
                    // 向下移动
                    this.y += this.ySpeed * ( time - this.yLastMove );
                    this.yLastMove = time;
                    // 检查是否越界
                    if( this.y > this.toY ) this.y = this.toY;
                    // 移动SVG TEXT NODE 
                    this.dom.style.top =  this.y + 'px';
                }
                break;
        case 5 : // top弹幕和bottom相反
                if( this.y > this.toY ) { 
                    // 向上移动
                    this.y -= this.ySpeed * ( time - this.yLastMove );
                    this.yLastMove = time;
                    // 检查是否越界
                    if( this.y < this.toY ) this.y = this.toY;
                    // 移动SVG TEXT NODE 
                    this.dom.style.top =  this.y + 'px';
                } 
                break;
        case 6 : // 逆向弹幕的水平移动方向与1相反
                this.x += this.speed * ( time - this.lastTime ); 
                this.dom.style.left = this.x + 'px';
                this.dom.style.top =  this.y + 'px';
                break;
        case 7 : // 高级弹幕
                if( this.opacityTo != this.opacityFrom ) {
                    this.opacity = ( this.opacityTo - this.opacityFrom ) * ( timePassed / this.lt ) + this.opacityFrom;
                    this.dom.style.opacity = this.opacity;
                }
                if( this.isMove ) {
                    // 里面套的max/min是为了保证移动不会超出设定位置
                    // 以及高级弹幕因为不存在两次移动的情况，所以x/y不用更新，把计算值直接赋给dom.style就行了
                    this.dom.style.top = ((this.toY - this.y) * (Math.min(Math.max( timePassed - this.moveDelay, 0), this.moveDuration) / this.moveDuration) + parseInt(this.y)) + "px";
                    this.dom.style.left = ((this.toX - this.x) * (Math.min(Math.max( timePassed - this.moveDelay, 0), this.moveDuration) / this.moveDuration) + parseInt(this.x)) + "px";
                }
                break;
    }
    this.lastTime = time;
}

/*
 * 弹幕越界删除
 *
 */
DANMAKU.prototype.remove = function() {
    // 移除SVG TEXT NODE
    this.dom.parentNode.removeChild(this.dom);
    // 从弹幕池中移除
    this.removeFromDanmakuLayer();
    // 从正在显示队列中移除
    RUNNING_LIST.remove(this);
    // 去除弹幕列表中这条弹幕的激活状态
    if( !this.isNew ) document.querySelector('#d' + this.id).className = '';
}

/*
 * 把一条弹幕的所有属性显示到她的DOM结构上
 *
 */
DANMAKU.prototype.displayProperty = function() {
    // 仅在DEBUG模式下使用，否则经常更新DOM结构太浪费资源
    if( !GLOBAL_CONFIG.debug ) return;
    var self = this,
        p = '';
    for( var property in self ) {
        // 函数、DOM引用和文本内容不用输出
        if( typeof self[property] == 'function' || typeof self[property] == 'object' || property == 'text' )
            continue;
        p += property + ':' + self[property] + ';';
    }
    this.dom.setAttribute('propertys', p);
}

/////////////////////////////////////////////////////////////////////////////////
// 下面是静态方法

/*
 * 初始化弹幕池
 * 
 */
DANMAKU.init = function( danmaku_xml_url ) {
    // 初始化弹幕
    DANMAKU.load( danmaku_xml_url );
    // 与后台弹幕管理建立长连接
    SOCKET = new socket();
}


/*
 * 销毁弹幕池
 *
 */
DANMAKU.clear = function() {
    // 让整个运行列表中的实例全部执行自毁函数
    while( RUNNING_LIST.length ) {
        RUNNING_LIST[0].remove();
    }

    // 然后清除对原有列表的引用，初始化弹幕池的各种状态
    DANMAKU_LIST = [];
    RUNNING_LIST = [];
    DANMAKU_LAST_POS  = 0;
    DANMAKU_LAST_TIME = 0; // LAST_TIME也必须清0，这样才会触发DANMAKU.t2p重新查找弹幕位置
    DANMAKU_POOL = {'scroll': [], 'top': [], 'bottom': [], 'reverse': []};
}


/*
 * 读取弹幕文件
 * 
 */
DANMAKU.load = function( url, callback ) {
    // 清空当前弹幕池
    DANMAKU.clear();

    // 准备ajax
    var xmlhttp = null;
    if (window.XMLHttpRequest){
        xmlhttp = new XMLHttpRequest();
    } else {
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    
    xmlhttp.onreadystatechange = function() {
        if ( xmlhttp.readyState == 4 ) {
            // 正常返回数据
            if( xmlhttp.status == 200 ) {
                // 处理返回值
                var xmldoc = null;
                if( navigator.appName == 'Microsoft Internet Explorer' ){
                    xmldoc = new ActiveXObject( "Microsoft.XMLDOM" );
                    xmldoc.async = false;
                    xmldoc.loadXML( xmlhttp.responseText );
                } else {
                    xmldoc = xmlhttp.responseXML;
                }

                // 检查xml是否为空
                if( !xmldoc || !validateXML(xmldoc) ) {
                    MSG( '弹幕文件无效' );
                    return;
                }

                // 把返回值传给DANMAKU.parse解析成object
                DANMAKU_LIST = DANMAKU.parse(xmldoc);
                // 弹幕队列按时间排序
                DANMAKU_LIST.sort(function(a,b){
                    // 优先根据弹幕显示时间排序
                    if( a.stime > b.stime ) return 1;
                    else if( a.stime < b.stime ) return -1;
                    // 弹幕时间相同则根据发布时间排序
                    else {
                        if( a.date > b.date ) return 1;
                        else if( a.date < b.date ) return -1;
                        // 如果时间戳也没有就看有没有弹幕id，有的话用弹幕id来比较先后
                        else if( a.id != null && b.id != null ) {
                            if( a.id > b.id ) return 1;
                            else if( a.id < b.id ) return -1;
                            else return 0;
                        } else
                            return 0;
                        // 如果date也没有那就返回相同吧...
                        return 0;
                    }
                });
            } else {
                // ajax出错的情况
                // 看起来404之类的错误捕捉不到，那就拉倒吧
            }

            // 获取完成后把弹幕显示到弹幕列表中
            DANMAKU.list();
        }
    }

    // 发起ajax
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}

/*
 * 将文本数据解析成object
 * 
 */
DANMAKU.parse = function( xmlDoc ) {
    // 每条弹幕在xml文件中是一个d节点
    var elems = xmlDoc.getElementsByTagName('d');
    var d = [];
    // 遍历弹幕列表
    for(var i = 0; i < elems.length; i++ ){
        if( elems[i].getAttribute('p') != null ) {
            // 每个节点的innerHTML是弹幕文本
            var text = elems[i].childNodes[0].nodeValue;
            // p属性上的是弹幕参数，以,分隔
            var opt = elems[i].getAttribute('p').split(',');
            var obj = {};
            // 弹幕出现时间
            obj.stime = Math.round( parseFloat(opt[0]*1000) );
            // 弹幕类型
            obj.mode = parseInt(opt[1]);
            // 字体大小 font-size
            obj.size = parseInt(opt[2]);
            // 弹幕颜色
            obj.color = parseInt(opt[3]);
            // 发送时间戳
            obj.date = parseInt(opt[4]);
            // 弹幕池，不知做啥的，似乎要自己算
            obj.pool = parseInt(opt[5]);
            // 弹幕发送者的hash值，用于批量屏蔽弹幕
            obj.hash = opt[6];
            // 弹幕id，是这条弹幕的唯一id
            if( opt[7] != null )
                obj.id = parseInt(opt[7]);

            // mode=7是特殊弹幕，其他弹幕的格式是统一的
            if( obj.mode < 7 ) {
                // 把ascii换成html标签
                obj.text = text.replace(/(\/n|\\n|\n|\r\n)/g, "<br>").replace(/\s/g, '&nbsp;');
            } else {
                if( obj.mode == 7 ) {
                    try {
                        // bili的高级弹幕里会带tab，要把这个去掉不然没法解析
                        text = text.replace(/\t/g, "\\t");
                        var adv = JSON.parse(text);
                        // 弹幕初始位置
                        obj.x = adv[0];
                        obj.y = adv[1];
                        // 弹幕不透明度变化
                        var tmp = adv[2].split('-');
                        if( tmp != null && tmp.length > 1 ) {
                            obj.opacityFrom = parseFloat(tmp[0]);
                            obj.opacityTo = parseFloat(tmp[1]);
                        } else {
                            obj.opacityFrom = 1;
                            obj.opacityTo = 1;
                        }
                        // 弹幕显示时间
                        if( adv[3] < 12 ) {
                            obj.lifeTime = adv[3] * 1000;
                        } else {
                            obj.lifeTime = 2500;
                        }
                        // 处理弹幕文本
                        // 换行
                        var inner_text = adv[4].replace(/(\/n|\\n|\n|\r\n)/g, "<br>");
                        // 全角空格
                        inner_text = inner_text.replace(/　/g, '&nbsp;&nbsp;');
                        // 空格
                        inner_text = inner_text.replace(/\s/g, '&nbsp;');
                        obj.text = inner_text;
                        // 旋转角度
                        if( adv.length >= 7 ) {
                            obj.rZ = adv[5];
                            obj.rY = adv[6];
                        }
                        // 移动弹幕
                        obj.isMove = false;
                        if( adv.length >= 11 ) {
                            // 目标位置
                            obj.toX = adv[7];
                            obj.toY = adv[8];
                            // 判断弹幕是否需要移动
                            if( obj.toX != obj.x || obj.toY != obj.y )
                                obj.isMove = true;
                            // 移动时间，弹幕不一定是整个显示周期内都在移动
                            if( adv[9] != '' )
                                obj.moveDuration = adv[9];
                            // 移动开始前的延迟
                            if( adv[10] != '' )
                                obj.moveDelay = adv[10];
                            // 是否描边
                            if( adv.length > 11 ) {
                                obj.stroke = adv[11] == 'false' ? false : true;
                                // 可以指定独特的字体
                                if( adv[12] != null )
                                    obj.font = adv[12];
                            }
                        }
                    } catch(e) {
                        // 唔……解析不出来
                        MSG('无法解析高级弹幕的JSON:', e, e.message);
                        DEBUG(text);
                    }
                }
            }
            // ■这种方块好像效果不大好，█相对来说会好一些？
            if(obj) obj.text = obj.text.replace(/\u25a0/g, "\u2588");
            d.push(obj);
        }
    }
    return d;
}

/*
 * 将当前弹幕显示到弹幕列表
 *
 */
DANMAKU.list = function() {
    // 把全局变量引用到本地
    var danmaku_list = DANMAKU_LIST,
        danmaku_list_dom = document.querySelector('#danmaku-list'),
        len = danmaku_list.length,
        ul = document.createElement('ul');

    // 清空老的弹幕列表
    while( danmaku_list_dom.firstChild )
        danmaku_list_dom.removeChild( danmaku_list_dom.firstChild );

    // 写入新的
    for( var i = 0; i < len; i++ ) {
        // span里显示弹幕时间
        var li = document.createElement('li'),
            span = document.createElement('span'),
            text = document.createTextNode( danmaku_list[i]['text'].replace(/<br>/g, '').replace(/&nbsp;/g, ' ') );
        
        span.innerHTML = s2t(danmaku_list[i]['stime']);

        li.setAttribute('id', 'd' + danmaku_list[i]['id']);
        li.appendChild(span);
        li.appendChild(text);
        ul.appendChild(li);
    }

    // 把dl加入到页面里
    danmaku_list_dom.appendChild(ul);
}


/*
 * 二分查找某个时间点在弹幕列表中位置
 * (time to position)
 * 
 */
DANMAKU.t2p = function( time ) {
    return DANMAKU_LIST.bsearch( time, function(a,b) {
        if(a < b.stime) return -1
        else if(a > b.stime) return 1;
        else return 0;
    });
}

/*
 * 检验弹幕是否正确
 * 
 */
DANMAKU.validate = function( danmaku ) {
    return true;
}

/*
 * 用户发送新弹幕
 *
 */
DANMAKU.send = function() {
    var opt = {};
    // 弹幕出现时间要根据现在video播放的进度来设置
    opt.stime = TIME;
    // demo嘛，就只允许设置mode和text两个参数了
    var mode = document.querySelector('#danmaku-type');
    opt.mode = parseInt(mode.options[mode.selectedIndex].value);
    opt.text = document.querySelector('#danmaku-text').value;

    // 其他都暂且填默认数据，需要的话自己多写几个input出来就行了
    opt.size = 25;
    opt.color = 16777215;

    // 用户身份
    opt.user = getCookie('user');
    opt.signature = getCookie('signature');

    /* 再其他的参数都由服务端来填，交给js做不安全 */

    // 检查弹幕有效性
    if( !DANMAKU.validate(opt) ) return false;
    
    // 检查是否允许忽略弹幕管理，允许的话不请求后台，直接加入弹幕队列
    if( GLOBAL_CONFIG.ignore_dm ) {
        // 增加边框
        opt.isNew = true;
        DANMAKU.insert(opt);
        // 清空输入框
        document.querySelector('#danmaku-text').value = '';
        // 提示
        MSG('发送了一条本地弹幕');
    } else {
        // 把参数转成url
        var params = serialize(opt);

        // 发送新增弹幕请求
        SOCKET.send(params);
    }

    return false;
}

/*
 * 把新弹幕插入弹幕队列
 * 
 */
DANMAKU.insert = function( danmaku ) {
    DANMAKU_LIST.binsert( danmaku, function(a, b) {
        // 优先根据弹幕显示时间排序
        if( a.stime > b.stime ) return 1;
        else if( a.stime < b.stime ) return -1;
        // 弹幕时间相同则根据发布时间排序
        else {
            if( a.date > b.date ) return 1;
            else if( a.date < b.date ) return -1;
            // 如果时间戳也没有就看有没有弹幕id，有的话用弹幕id来比较先后
            else if( a.id != null && b.id != null ) {
                if( a.id > b.id ) return 1;
                else if( a.id < b.id ) return -1;
                else return 0;
            } else
                return 0;
            // 如果date也没有那就返回相同吧...
            return 0;
        }
    });
}

/*
 * 检查是否有弹幕需要加入弹幕池
 * 
 */
DANMAKU.update = function() {
    // 用本地变量引用全局变量
    var time = TIME,
        len = DANMAKU_LIST.length,
        pos = DANMAKU_LAST_POS,
        lt  = DANMAKU_LAST_TIME;

    // 人工控制播放进度（点击进度条）时重新计算DANMAKU_LAST_POS
    if( pos >= len || Math.abs(lt - time) >= 2000 ) {
        pos = DANMAKU.t2p(time);
        lt = time;
        if( pos >= len )
            return;
    } else lt = time;

    // 从DANMAKU_LAST_POS开始向后遍历弹幕列表
    // 显示时间到的就生成实例
    for( ; pos < len; pos++ ) {
        if( DANMAKU_LIST[pos]['stime'] <= time ) {
            new DANMAKU( DANMAKU_LIST[pos], time );
        }
        else break;
    }
    
    // 把本地变量的值写回全局变量
    DANMAKU_LAST_POS  = pos;
    DANMAKU_LAST_TIME = lt
}

/*
 * 每帧的运算和显示
 * 
 */
DANMAKU.frame = function() {
    // 遍历弹幕池
    // 执行效率好像有点低，必须动态获取RUNNING_LIST的长度..
    for( var i = 0; i < RUNNING_LIST.length; i++ ) {
            // 调用每个弹幕实例的运算函数，自己去计算下一帧的状态
            RUNNING_LIST[i].frame();
    }
}



/*
 * 切换是否鼠标悬浮高亮
 *
 */
DANMAKU.hoverHighLight = function(flag) {
    // DEBUG模式下永远都高亮
    if( GLOBAL_CONFIG.debug ) return;

    // 正常模式下暂停高亮
    var dm = document.querySelectorAll('.danmaku'),
        len = dm.length;
    for( var i = 0; i < len; i++ ) {
        if( flag ) 
            dm[i].className += ' debug';
        else
            removeClass(dm[i], 'debug');
    }
}



/*
 * 弹幕右键菜单
 *
 */
DANMAKU.contextmenu = function(e) {
    // 调整自定义菜单
    cm.style.left = e.pageX + 'px';
    cm.style.top = e.pageY + 'px';
    cm.style.display = 'block';

    var did = this.getAttribute('did');
    cm.setAttribute('did', did);
    cm.setAttribute('uid', this.getAttribute('uid'));

    // 给选中的增加高亮class
    document.querySelector('[did="' + did + '"]').className += ' hover';

    // 屏蔽浏览器右键菜单
    e.preventDefault();
    return false;
}


/*
 * 屏蔽向
 *
 */
// 屏蔽弹幕
DANMAKU.block = function() {
    // 屏蔽请求
    var did = cm.getAttribute('did'),
        url = GLOBAL_CONFIG.block_danmaku + did;
    
    var xmlhttp = null;
    if (window.XMLHttpRequest) {
        xmlhttp = new XMLHttpRequest();
    } else {
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    
    xmlhttp.onreadystatechange = function() {
        if ( xmlhttp.readyState == 4 ) {
            var type = document.querySelector('#block-this-type'),
                text = type.innerHTML;
            // type.innerHTML = text == '屏蔽' ? '解除屏蔽' : '屏蔽';
            // 隐藏弹幕
            document.querySelector('[did="' + did + '"]').style.display = 'none';
            cm.style.display = 'none';
        }
    }

    // 发起ajax
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}
// 屏蔽用户
DANMAKU.blockUser = function() {
    // 屏蔽请求
    var uid = cm.getAttribute('uid'),
        url = GLOBAL_CONFIG.block_user + uid;
    
    var xmlhttp = null;
    if (window.XMLHttpRequest){
        xmlhttp = new XMLHttpRequest();
    } else {
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    
    xmlhttp.onreadystatechange = function() {
        if ( xmlhttp.readyState == 4 ) {
            var type = document.querySelector('#block-user-type'),
                text = type.innerHTML;
            // type.innerHTML = text == '屏蔽' ? '解除屏蔽' : '屏蔽';
            document.querySelector('[uid="' + uid + '"]').style.display = 'none';
            cm.style.display = 'none';
        }
    }

    // 发起ajax
    xmlhttp.open("GET", url, true);
    xmlhttp.send();
}

/*
 * 内容过滤
 *
 */
CONTENT_FILTER_LIST = [];
DANMAKU.addContentFilter = function() {
    var c = document.querySelector('#filter-content'),
        type = document.querySelector('#filter-type').value,
        keyword = '';

    switch( type ) {
        case 'keyword' : keyword = c.value; break;
        case 'regx' : keyword = new RegExp(c.value); break;
    }

    CONTENT_FILTER_LIST.push(keyword);
    c.value = '';

    // 输出一下好了
    DEBUG( CONTENT_FILTER_LIST );
}

// 隐藏弹幕
DANMAKU.hideDanmaku = function() {
    var self = document.querySelector('#hide-danmaku'),
        dl = document.querySelectorAll('.danmaku');
    if( self.checked ) {
        GLOBAL_CONFIG.hide_danmaku = true;
        for( var i = 0; i < dl.length; i++ ) {
            dl[i].className += ' hide';
        }
    } else {
        GLOBAL_CONFIG.hide_danmaku = false;
        for( var i = 0; i < dl.length; i++ ) {
            removeClass(dl[i], 'hide');
        }
    }
}