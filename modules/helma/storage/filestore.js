require('core/object');
require('core/array');
include('core/json');
include('helma/file');
include('helma/functional');
include('./storeutils');

export("Store", "Storable", "Transaction");

var __shared__ = true;
var log = require('helma/logging').getLogger(__name__);

var Storable = require('./storable').Storable;
Storable.setStoreImplementation(this);

var datastore = new Store("db");

function list(type, options, thisObj) {
    var array = getAll(type);
    if (options) {
        // first filter out the the items we're not interested in
        var filter = options.filter;
        if (typeof filter == "function") {
            array = array.filter(filter, thisObj);
        }
        // then put them into order
        var orderBy = options.orderBy,
                ascDesc = options.order == "desc" ? -1 : 1;
        if (options.orderBy) {
            array = array.sort(function(o1, o2) {
                var p1 = o1[orderBy],
                        p2 = o2[orderBy];
                if (p1 < p2) return -1 * ascDesc;
                if (p1 > p2) return  1 * ascDesc;
                return 0;
            })
        }
        // finally apply pagination/slicing
        var start = parseInt(options.start, 10),
                max = parseInt(options.max, 10);
        if (isFinite(start) || isFinite(max)) {
            start = start || 0;
            array = array.slice(start, start + max || array.length);
        }
    }
    return array;
}

function all(type) {
    return datastore.retrieveAll(type);
}

function get(type, id) {
    return datastore.retrieve(type, id);
}

function save(props, entity, txn) {
    var wrapTransaction = false;
    if (!txn) {
        txn = new Transaction();
        wrapTransaction = true;
    }

    if (updateEntity(props, entity, txn)) {
        datastore.store(entity, txn);
        if (wrapTransaction) {
            txn.commit();
        }
    }
}

function remove(key, txn) {
    var wrapTransaction = !txn;
    if (wrapTransaction) {
        txn = new Transaction();
    }

    datastore.remove(key, txn);

    if (wrapTransaction) {
        txn.commit();
    }
}

function query() {
    // TODO
}

function getEntity(type, arg) {
    if (isKey(arg)) {
        var [type, id] = arg.$ref.split(":");
        return datastore.load(type, id);
    } else if (isEntity(arg)) {
        return arg;
    } else if (arg instanceof Object) {
        var entity = arg.clone({});
        Object.defineProperty(entity, "_key", {
            value: createKey(type, datastore.generateId(type))
        });
        return entity;
    }
    return null;
}

/**
 * File Store class
 * @param path the database directory
 */
function Store(path) {

    // map of type to current id tip
    var idMap = {};

    this.store = function(entity, txn) {
        var [type, id] = entity._key.$ref.split(":");

        var dir = new File(base, type);
        if (!dir.exists()) {
            if (!dir.makeDirectory()) {
                throw new Error("Can't create directory for type " + type);
            }
        }

        var file = new File(dir, id);
        if (file.exists() && !file.canWrite()) {
            throw new Error("No write permission for " + file);
        }

        var tempFileName = type + id + ".";
        var tempfile = base.createTempFile(tempFileName, ".tmp");

        if(log.isDebugEnabled())
            log.debug("Storing object: " + object.toSource());

        tempfile.open({ append: true });
        tempfile.write(JSON.stringify(entity));
        tempfile.close();
        txn.updateResource({ file: file, tempfile: tempfile });
    };

    this.load = function(type, id) {
        var file = new File(new File(base, type), id);

        if (!file.exists()) {
            return null;
        } else if (!file.isFile()) {
            throw new Error("Is not a regular file: " + file);
        }

        var content = file.readAll();
        var entity = JSON.parse(content);
        Object.defineProperty(entity, "_key", {
            value: createKey(type, id)
        });
        return entity;
    };

    this.retrieve = function(type, id) {
        var entity = this.load(type, id);
        if (entity) {
            return new Storable(type, entity);
        }
        return null;
    };

    this.retrieveAll = function(type) {
        var dir = new File(base, type);
        if (!dir.exists() || !dir.isDirectory()) {
            return [];
        }
        var files = dir.listFiles();
        var list = [];

        for each (var file in files) {
            if (!file.isFile() || file.isHidden()) {
                continue;
            }
            list.push(new Storable(type, createKey(type, file.getName())));
        }
        return list;
    };

    this.remove = function(key, txn) {
        if (!isKey(key)) {
            throw new Error("Invalid key object: " + key);
        }
        var [type, id] = key.$ref.split(":");
        var file = new File(new File(base, type), id);
        txn.deleteResource({ file: file });        
    };

    this.generateId = function(type) {
        var dir = new File(base, type);
        var id = idMap[type] || 1;
        var file = new File(dir, id.toString(36));
        while(file.exists()) {
            id += 1;
            file = new File(dir, id.toString(36));
        }

        idMap[type] = id + 1;
        return file.getName();
    };

    var base = new File(path);
    log.debug("Set up new store: " + base);

};

function Transaction() {

    var updateList = [];
    var deleteList = [];

    var tx = new BaseTransaction();

    tx.deleteResource = function(res) {
        deleteList.push(res);
    }

    tx.updateResource = function(res) {
        updateList.push(res);
    }

    tx.commit = function() {
        for each (var res in updateList) {
            // because of a Java/Windows quirk, we have to delete
            // the existing file before trying to overwrite it
            if (res.file.exists()) {
                res.file.remove();
            }
            // move temporary file to permanent name
            if (res.tempfile.renameTo(res.file)) {
                // success - delete tmp file
                res.tempfile.remove();
            } else {
                // error - leave tmp file and print a message
                log.error("Couldn't move file, committed version is in " + res.tempfile);
            }
        }

        for each (var res in deleteList) {
            res.file.remove();
        }

        updateList = [];
        deleteList = [];
    }

    tx.abort = function() {
        for each (var res in updateList) {
            res.tempfile.remove();
        }
    }

    return tx;
}
