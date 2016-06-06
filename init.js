/**
 * Created by kiknadze on 02.06.2016.
 */

(function ($) {
    var cellWidth = 334;
    var dbTemplate =
        '<div class="fields-container database">' +
        '   <div><h2 class="header">Database</h2><input type="button" value="Start"/><input type="button" value="Commit"/><input type="button" value="Rollback"/></div>' +
        '   <div class="field-container" role="id"><div class="label">Id:</div><div class="readonly-value"></div></div>' +
        '   <div class="field-container" role="name"><div class="label">Name:</div><div class="readonly-value"></div></div>' +
        '   <div class="field-container" role="master"><div class="label">Master DB:</div><div class="readonly-value"></div></div>' +
        '   <div class="field-container list" role="roots-list"></div>' +
        '</div>';

    var rootTemplate =
        '<div class="fields-container root"><h3>Root</h3>' +
        '   <div class="left">' +
        '       <div class="field-container" role="id"><div class="label">Id:</div><div class="readonly-value"></div></div>' +
        '       <div class="field-container" role="name"><div class="label">Name:</div><div class="readonly-value"></div></div>' +
        '       <div class="field-container" role="root-master"><div class="label">Master root:</div><div class="readonly-value"></div></div>' +
        '   </div>' +
        '   <div class="field-container list values" role="values-list"></div>' +
        '</div>';
    var valueTemplate =
        '<div class="field-container" role="value"><div class="label"></div><input type="text"/></div>';

    $("window").ready(function() {
        $(".all").height($(window).height() - 16);
        $(".db-container").height($(".all").height() - 65);
        $(window).resize(function() {
            $(".all").height($(window).height() - 16);
            $(".db-container").height($(".all").height() - 65);
        });



        var databases = {};
        var dbGuids = {};
        var dbRootsByGuids = {};
        var levels = {};

        var controller2 = new MemDbController();

        renderAllDatabases();

        createAllRoots();


        function renderAllDatabases() {
            levels = {};
            levels[0] = {x: 8, y: 8, h: 0};

            for (var i = 0; i < dbMeta.databases.length; i++) {
                var dbMetaInfo = dbMeta.databases[i];
                if (dbMetaInfo.master !== undefined && dbMetaInfo.master != null) continue;
                renderDatabase(dbMetaInfo);
            }
        }

        function renderDatabase(dbMetaInfo) {
            var body = $(".db-container");
            var dbInfo = databases[dbMetaInfo.id];

            if (!dbInfo) {
                var dbEl = $(dbTemplate);
                dbEl.attr("id", "db-" + dbMetaInfo.id);
                body.append(dbEl);
                dbInfo = {};
                dbInfo.id = dbMetaInfo.id;
                databases[dbMetaInfo.id] = dbInfo;
                dbInfo.element = dbEl;
                dbInfo.meta = dbMetaInfo;

                var dbObj;
                if (dbMetaInfo.master !== undefined && dbMetaInfo.master != null) {
                    var masterInfo = databases[dbMetaInfo.master];
                    dbInfo.database = new MemDatabase(controller2,masterInfo.database.getGuid());
                } else
                    dbInfo.database = new MemDatabase(controller2);

                dbGuids[dbInfo.database.getGuid] = dbInfo;
            }
            dbInfo.level = 0;
            if (dbMetaInfo.master !== undefined && dbMetaInfo.master != null) {
                var masterInfo = databases[dbMetaInfo.master];
                dbInfo.level = masterInfo.level + 1;
                if (!levels[dbInfo.level]) {
                    levels[dbInfo.level] = {
                        x: masterInfo.element.offset().left - 8,
                        y: levels[dbInfo.level - 1].y + levels[dbInfo.level - 1].h,
                        h: 0
                    }
                }
                levels[dbInfo.level].x = Math.max(masterInfo.element.offset().left - 8, levels[dbInfo.level].x);
            }


            dbInfo.element.css({ top: levels[dbInfo.level].y + "px", left: levels[dbInfo.level].x + "px"});
            levels[dbInfo.level].x += cellWidth;
            //dbInfo.element.css("margin-left", (dbInfo.level * 16) + "px");
            dbInfo.element.children("[role='id']").find(".readonly-value").text(dbMetaInfo.id);
            dbInfo.element.children("[role='name']").find(".readonly-value").text(dbMetaInfo.name);
            dbInfo.element.children("[role='master']").find(".readonly-value").text(dbMetaInfo.master ? dbMetaInfo.master : "null");

            var rootsList = dbEl.find("[role='roots-list']");
            for (var i = 0; i < dbMetaInfo.roots.length; i++) {
                var rootMeta = dbMetaInfo.roots[i];
                var rootElId = "root-" + dbMetaInfo.id + "-" +  rootMeta.id;
                var rootEl = $("#" + rootElId);
                if (rootEl.length == 0) {
                    var rootEl = $(rootTemplate);
                    rootEl.attr("id", rootElId);
                    rootsList.append(rootEl);
                }

                rootEl.children(".left").find(".field-container[role='id']").find(".readonly-value").text(rootMeta.id);
                rootEl.children(".left").find(".field-container[role='name']").find(".readonly-value").text(rootMeta.name);
                rootEl.children(".left").find(".field-container[role='root-master']").find(".readonly-value").text(rootMeta.master ? rootMeta.master : "null");

                var valList = rootEl.children(".list");
                valList.empty();
                if (rootMeta.data) {
                    for (var j in rootMeta.data) {
                        var data = rootMeta.data[j];
                        var dataElId = "data-" + dbMetaInfo.id + "-" +  rootMeta.id + "-" + j;
                        var dataEl = $("#" + dataElId);
                        if (dataEl.length == 0) {
                            var dataEl = $(valueTemplate);
                            dataEl.attr("id", dataElId);
                            valList.append(dataEl);
                        }

                        dataEl.find(".label").text(j);
                        dataEl.find("input").val(data);
                    }
                }
            }

            if (levels[dbInfo.level].h < dbInfo.element.height() + 28) levels[dbInfo.level].h = dbInfo.element.height() + 28;

            for (var i = 0; i < dbMeta.databases.length; i++) {
                var dbNextInfo = dbMeta.databases[i];
                if (dbNextInfo.master === undefined || dbNextInfo.master != dbMetaInfo.id) continue;
                renderDatabase(dbNextInfo);
                levels[dbInfo.level].x = levels[databases[dbNextInfo.id].level].x;
            }
        }

        function createAllRoots() {
            for (var i = 0; i < dbMeta.databases.length; i++) {
                var dbMetaInfo = dbMeta.databases[i];
                var dbInfo = databases[dbMetaInfo.id];
                for (var j = 0; j < dbMetaInfo.roots.length; j++) {
                    var rootInfo = dbMetaInfo.roots[j];
                    if (rootInfo.master) continue;
                    var mr = dbInfo.database.addMasterRoot(rootInfo.data);
                    dbRootsByGuids[mr.getGuid()] = { root: mr, dbInfo: dbInfo, id: rootInfo.id};
                }
            }

            createAllSlaves();
        }

        function createAllSlaves(masterRootInfo) {
            if (!masterRootInfo) {
                for (var mrGuid in dbRootsByGuids) {
                    var rootInfo = dbRootsByGuids[mrGuid];
                    createAllSlaves(rootInfo);
                }
            } else {
                var masterDbInfo = masterRootInfo.dbInfo;
                for (var i = 0; i < dbMeta.databases.length; i++) {
                    var dbMetaInfo = dbMeta.databases[i];
                    if (dbMetaInfo.master === undefined || dbMetaInfo.master != masterDbInfo.id) continue;
                    for (var j = 0; j < dbMetaInfo.roots.length; j++) {
                        var rootInfo = dbMetaInfo.roots[j];
                        if (!rootInfo.master) continue;
                        var dbInfo = databases[dbMetaInfo.id];
                        subscribeOnRoot(masterRootInfo, dbInfo, rootInfo);
                    }
                }
            }
        }

        function subscribeOnRoot(masterRootInfo, dbInfo, rootInfo) {
            dbInfo.database.subscribeRoots([masterRootInfo.root.getGuid()]).then(function(res) {
                var dbMetaInfo = dbInfo.meta;
                var newRootInfo = { root: res[0], dbInfo: dbInfo, id: rootInfo.id};

                var rootElId = "root-" + dbInfo.id + "-" +  rootInfo.id;
                var rootEl = $("#" + rootElId);
                var valList = rootEl.children(".list");
                valList.empty();
                var r = res[0];
                var idx = 0;
                while (r.getData(idx) !== undefined) {
                    var dataElId = "data-" + dbMetaInfo.id + "-" +  rootInfo.id + "-" + idx;
                    var dataEl = $("#" + dataElId);
                    if (dataEl.length == 0) {
                        var dataEl = $(valueTemplate);
                        dataEl.attr("id", dataElId);
                        valList.append(dataEl);
                    }
                    dataEl.find(".label").text(idx);
                    dataEl.find("input").val(r.getData(idx));
                    idx++;
                }

                createAllSlaves(newRootInfo);
            });
        }
    });
})(jQuery);
