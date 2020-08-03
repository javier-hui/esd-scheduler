const fs = require("fs");
const carbone = require("carbone");
const express = require("express");
const { resolveNaptr } = require("dns");
const app = express();
const port = 3000;

const schedulerPath = "./json/scheduler.json";
const oneOffPath = "./json/oneOff.json";
const todoPath = "./tmp/toDoList.json";
const phPath = "./json/ph.json";
const templatePath = "./tmp/template.docx";
const resultPath = './public/VALID V Daily Job Schedule.docx';

app.use(express.static(__dirname + "/public"));
app.listen(port);
console.log("server running on port " + port);

app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json()); // Parse JSON bodies (as sent by API clients)
app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});
app.post('/', function (req, res) { // Access the parse results as request.body
    var date = req.body;
    var scheduler = require(schedulerPath);
    var oneOff = require(oneOffPath);
    var loaded_task = false;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let dateArray = [date.day, months[date.month - 1], date.year, date.weekday]; //[date, month, year, day]
    const numberOfDayInFirstWeek = 3; //need edit every year
    filtering(scheduler, dateArray, numberOfDayInFirstWeek, loaded_task);
    loaded_task = !loaded_task;
    filtering(oneOff, dateArray, numberOfDayInFirstWeek, loaded_task);
    loaded_task = !loaded_task;
    sortTodo();
    var todo = fs.readFileSync(todoPath, 'utf8');
    todo = JSON.parse(todo);
    todo[0].date = date;
    console.log(todo);
    console.log("number of tasks: " + todo[0].tasks.length);
    carbone.render(templatePath, todo, function (err, result) {
        if (err) return console.log(err);
        fs.writeFileSync(resultPath, result);
        console.log("server generated report with date " + date.fullDate);
    });
    req.body.forms.push(resultPath.split("/")[2]);
    res.json(req.body);
});


function sortTodo() {
    var final = fs.readFileSync(todoPath, 'utf8');
    final = JSON.parse(final);
    final[0].tasks.sort(getSortOrder("StartTime"));
    fs.writeFileSync(todoPath, JSON.stringify(final), 'utf8');
}

// By Carson

function append(task) {
    const fs = require('fs');
    //Here is the data to be appended
    const startTime = task["StartTime"];
    const taskName = task["JobName"];
    const server = task["Server"];
    const remarks = task["Remarks"];
    const rules = task["Rules"];

    var oriJson = fs.readFileSync(todoPath, 'utf8');
    oriJson = JSON.parse(oriJson);
    var to_append = { StartTime: startTime, JobName: taskName, Server: server, Remarks: remarks, Rules: rules };
    oriJson[0]["tasks"].push(to_append);
    //console.log(oriJson);
    fs.writeFileSync(todoPath, JSON.stringify(oriJson), 'utf8');
};

function filtering(data, inputDate, firstWeek, loaded_task) {
    var phs = require(phPath);
    const numberOfData = Object.keys(data).length;
    const date = inputDate[0];
    const month = inputDate[1];
    const year = inputDate[2];
    const day = inputDate[3];
    var ph = false;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    if (!loaded_task) {
        console.log("clearing ToDoList.json...")
        var reset = '[{ "tasks": [] }]';
        fs.writeFileSync(todoPath, reset, 'utf8');
    }
    var oriJson = fs.readFileSync(todoPath, 'utf8');
    oriJson = JSON.parse(oriJson);
    console.log("before filtering: " + oriJson[0].tasks.length);

    var datesOfMonths = [];
    if (year % 4 == 0) { datesOfMonths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; }
    else { datesOfMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; };

    for (i = 0; i < Object.keys(phs).length; ++i) {
        if ((phs[i]["date"] == date && phs[i]["month"] == month) || day == "0") {
            ph = true;
            break;
        }
    }
    for (i = 0; i < numberOfData; ++i) {
        const task = data[i];
        const rules = task["Rules"].split("?");
        const include = rules[0];
        const exclude = rules[1];
        var valid = false;

        if (include.substring(0, 5) == "daily") {
            append(task);
            //Eliminating the selected one-off Tasks
            if (task["Rules"][task["Rules"].length - 1] == "@") {
                var OOJson = fs.readFileSync(oneOffPath, 'utf8');
                OOJson = JSON.parse(OOJson);
                OOJson.splice(i, 1);
                fs.writeFileSync(oneOffPath, JSON.stringify(OOJson), 'utf8');
            }
            continue;
        }

        const subrules = include.split(";");
        const numberOfRules = subrules.length;
        for (j = 0; j < numberOfRules - 1; ++j) {
            if (subrules[j].includes("week")) {
                const weeklyRules = subrules[j].substring(5,).split(",");
                const numberOfRules = weeklyRules.length;
                for (k = 0; k < numberOfRules; ++k) {
                    if (weeklyRules[k] == day) {
                        valid = true;
                        break;
                    }
                }
            }
            if (subrules[j].includes("month")) {
                const monthlyRules = subrules[j].substring(6,).split(",");
                const numberOfRules = monthlyRules.length;
                for (k = 0; k < numberOfRules; ++k) {
                    if (monthlyRules[k] == date) {
                        valid = true;
                        break;
                    }
                }
            }
            if (subrules[j].includes("year")) {
                const yearlyRules = subrules[j].substring(5,).split(",")
                const numberOfRules = yearlyRules.length;
                for (k = 0; k < numberOfRules; ++k) {
                    if (yearlyRules[k].substring(0, 2) == date && yearlyRules[k].substring(2,) == month) {
                        valid = true;
                        break;
                    }
                }
            }
            if (subrules[j].includes("workingday") && !ph) {
                const wdRules = subrules[j].substring(11,).split(",")
                const numberOfRules = wdRules.length;
                for (k = 0; k < numberOfRules; ++k) {
                    var numberOfPh = 1;
                    var numberOfWd = 0;
                    for (x = date - 1; x > date - day; --x) {
                        for (y = 0; y < Object.keys(phs).length; ++y) {
                            if (phs[y]["date"] == x && phs[y]["month"] == month) {
                                numberOfPh++;
                            }
                        }
                    }
                    numberOfWd = Number(day) - numberOfPh + 1;
                    if (numberOfWd == wdRules[k]) {
                        valid = true;
                        break;
                    }
                }
            }
            if (subrules[j].includes("lastday")) {
                const ldRules = subrules[j].substring(8,).split(",");
                const numberOfRules = ldRules.length;
                for (k = 0; k < numberOfRules; ++k) {
                    for (x = 0; x < months.length; ++x) {
                        if (months[x] == month) {
                            if (datesOfMonths[x] - Number(ldRules[k]) + 1 == date) {
                                valid = true;
                                break;
                            }
                        }
                    }
                }
            }


            if (subrules[j].includes("biweekly")) {
                let bw = false;
                let numberOfDay = Number(date);
                for (k = 0; k < months.length; ++k) {
                    if (months[k] == month) { numberOfDay -= firstWeek; break; }
                    else { numberOfDay += datesOfMonths[k]; };
                }
                if (numberOfDay / 7 % 2 == 0) { bw = true; };
                if (bw) {
                    const bwRules = subrules[j].substring(9,).split(",");
                    const numberOfRules = bwRules.length;
                    for (k = 0; k < numberOfRules; ++k) {
                        if (bwRules[k] == day) {
                            valid = true;
                            break;
                        }
                    }
                }
            }
        }
        if (exclude) {
            const subConstraints = exclude.split(";");
            const numberOfConstraint = subConstraints.length;
            for (j = 0; j < numberOfConstraint - 1; ++j) {
                if (subConstraints[j].includes("ph") && ph) {
                    valid = false;
                    break;
                }
                if (subConstraints[j].includes("week")) {
                    const weeklyRules = subConstraints[j].substring(5,).split(",");
                    const numberOfRules = weeklyRules.length;
                    for (k = 0; k < numberOfRules; ++k) {
                        if (weeklyRules[k] == day) {
                            valid = false;
                            break;
                        }
                    }
                }
                if (subConstraints[j].includes("month")) {
                    const monthlyRules = subConstraints[j].substring(6,).split(",");
                    const numberOfRules = monthlyRules.length;
                    for (k = 0; k < numberOfRules; ++k) {
                        if (monthlyRules[k] == date) {
                            valid = false;
                            break;
                        }
                    }
                }
                if (subConstraints[j].includes("year")) {
                    const yearlyRules = subConstraints[j].substring(5,).split(",")
                    const numberOfRules = yearlyRules.length;
                    for (k = 0; k < numberOfRules; ++k) {
                        if (yearlyRules[k].substring(0, 2) == date && yearlyRules[k].substring(2,) == month) {
                            valid = false;
                            break;
                        }
                    }
                }
                if (subConstraints[j].includes("workingday") && !ph) {
                    const wdRules = subConstraints[j].substring(11,).split(",")
                    const numberOfRules = wdRules.length;
                    for (k = 0; k < numberOfRules; ++k) {
                        var numberOfPh = 1;
                        var numberOfWd = 0;
                        for (x = date - 1; x < date - day; --x) {
                            for (y = 0; y < Object.keys(phs).length; ++y) {
                                if (phs[y]["date"] == x && phs[y]["month"] == month) {
                                    numberOfPh++;
                                };
                            };
                        };
                        numberOfWd = Number(day) - numberOfPh + 1;
                        if (numberOfWd == wdRules[k]) {
                            valid = true;
                            break;
                        }
                    }
                }
            }
        }
        //Special Cases
        if(include == "SC1"){
            if(date == "2" && date != "28" && month != "Jan"){
                valid = true;
            }
            else if(date == "29" && month == "Jan"){
                valid = true;
            }
        };
        //2Jan 29Jan 6Apr 14Apr 2May 26Jun 2Jul 3Oct 28Dec
        if(include == "SC2"){
            if((date == "2" || date == "29") & month == "Jan") valid = true;
            else if((date == "6" || date == "14") & month == "Apr") valid = true;
            else if((date == "2") & month == "May") valid = true;
            else if((date == "26") & month == "Jun") valid = true;
            else if((date == "2") & month == "Jul") valid = true;
            else if((date == "3") & month == "Oct") valid = true;
            else if((date == "28") & month == "Aug") valid = true;
        };
        //27Jan 24Feb 30Mar 27Apr 1Jun 29Jun 27Jul 31Aug 28Sep 26Oct 30Nov 28Dec
        if(include == "SC3"){
            if((date == "27") & month == "Jan") valid = true;
            else if((date == "24") & month == "Feb") valid = true;
            else if((date == "30") & month == "Mar") valid = true;
            else if((date == "27") & month == "Apr") valid = true;
            else if((date == "1" || date == "29") & month == "Jun") valid = true;
            else if((date == "27") & month == "Jul") valid = true;
            else if((date == "31") & month == "Aug") valid = true;
            else if((date == "28") & month == "Sep") valid = true;
            else if((date == "26") & month == "Oct") valid = true;
            else if((date == "30") & month == "Nov") valid = true;
            else if((date == "28") & month == "Dec") valid = true;
        };
        //Eliminating the selected one-off Tasks
        if (valid && task["Rules"][task["Rules"].length - 1] == "@") {
            var OOJson = fs.readFileSync(oneOffPath, 'utf8');
            OOJson = JSON.parse(OOJson);
            OOJson.splice(i, 1);
            fs.writeFileSync(oneOffPath, JSON.stringify(OOJson), 'utf8');

        };
        //Append the task to ToDoList.json
        if (valid) {
            append(task);
        };
    };
    var oriJson = fs.readFileSync(todoPath, 'utf8');
    oriJson = JSON.parse(oriJson);
    console.log("after filtering: " + oriJson[0].tasks.length);
};

function getSortOrder(prop) {    
    return function(a, b) {
        let a_hr = Number(a[prop].split(":")[0]);
        let a_min = Number(a[prop].split(":")[1]);
        let b_hr = Number(b[prop].split(":")[0]);
        let b_min = Number(b[prop].split(":")[1]);

        if (a_hr < 8){a_hr += 24};
        if (b_hr < 8){b_hr += 24};
        if (a_hr > b_hr) {
            return 1;
        } else if (a_hr < b_hr) {    
            return -1;
        } else {
            if (a_min > b_min) {    
                return 1;
            } else if (a_min < b_min) {    
                return -1;
            }
        }
    }    
};

function formAppend(task, path, destination, type, freq) {
    const fs = require('fs');

    var oriJson = fs.readFileSync(path, 'utf8');
    oriJson = JSON.parse(oriJson);
    var to_append = "";
    if (destination == "SCC") {
        to_append = { ToSCC: task };
    }
    else if (destination == "PCC") {
        to_append = { ToPCC: task };
    };
    if (freq == "weekly") {
        if (type == "V5") {
            oriJson[0]["weekly"][0]["V5"].push(to_append);
        }
        else if (type == "VRMS") {
            oriJson[0]["weekly"][2]["VRMS"].push(to_append);
        }
        else if (type == "PPS") {
            oriJson[0]["weekly"][1]["PPS"].push(to_append);
        }
        else if (type == "backup") {
            oriJson[0]["weekly"][3]["Copy"].push(to_append);
        }
    }
    else if (freq == "monthly") {
        oriJson[1]["monthly"].push(to_append);
    };
    fs.writeFileSync(path, JSON.stringify(oriJson), 'utf8');
};
function formFiltering(data_1, data_2, data_3, inputDate, firstWeek) {
    const fs = require('fs');
    const date = inputDate[0];
    const month = inputDate[1];
    const year = inputDate[2];
    const day = inputDate[3];

    var datesOfMonths = [];
    if (year % 4 == 0) { datesOfMonths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; }
    else { datesOfMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; };

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var numberOfDay = Number(date);
    for (k = 0; k < months.length; ++k) {
        if (months[k] == month) {
            numberOfDay -= firstWeek; break;
        }
        else {
            numberOfDay += datesOfMonths[k];
        };
    };
    var numberOfMon = Math.floor(numberOfDay / 7);
    if (firstWeek >= 6) { numberOfMon++; };
    if (day >= 1) { numberOfMon++; };
    console.log(numberOfMon);

    var reset_1 = fs.readFileSync(OTCL_path, 'utf8');
    reset_1 = [{ "weekly": [{ "V5": [] }, { "PPS": [] }, { "VRMS": [] }, { "Copy": [] }] }, { "monthly": [] }];
    fs.writeFileSync(OTCL_path, JSON.stringify(reset_1), 'utf8');

    var reset_2 = fs.readFileSync(delivery_path, 'utf8');
    reset_2 = [];
    fs.writeFileSync(delivery_path, JSON.stringify(reset_2), 'utf8');

    const numberOfData_1 = Object.keys(data_1).length;
    var delivery_scc = [];
    var delivery_pcc = [];
    for (i = 0; i < numberOfData_1; ++i) {
        let task = data_1[i];
        let rules = task["Rules"].split("/");
        let rule = rules[0];
        let destination = rules[1]
        let to_be_append_OFF = [];
        let to_be_append_ON = [];
        if (rule == "weekly" && day == "1") {
            if (numberOfMon % 5 == 2) {
                if (destination == "SCC") {
                    to_be_append_OFF = (task["Tapes"][0]);
                    to_be_append_ON = (task["Tapes"][4]);
                    delivery_scc.push("1-mirror");
                    delivery_pcc.push("5-mirror");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = (task["Tapes"][4]);
                    to_be_append_ON = (task["Tapes"][0]);
                    delivery_scc.push("5");
                    delivery_pcc.push("1");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
            }
            else if (numberOfMon % 5 == 3) {
                if (destination == "SCC") {
                    to_be_append_OFF = (task["Tapes"][1]);
                    to_be_append_ON = (task["Tapes"][0]);
                    delivery_scc.push("2-mirror");
                    delivery_pcc.push("1-mirror");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = (task["Tapes"][0]);
                    to_be_append_ON = (task["Tapes"][1]);
                    delivery_scc.push("1");
                    delivery_pcc.push("2");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
            }
            else if (numberOfMon % 5 == 4) {
                if (destination == "SCC") {
                    to_be_append_OFF = (task["Tapes"][2]);
                    to_be_append_ON = (task["Tapes"][1]);
                    delivery_scc.push("3-mirror");
                    delivery_pcc.push("2-mirror");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = (task["Tapes"][1]);
                    to_be_append_ON = (task["Tapes"][2]);
                    delivery_scc.push("2");
                    delivery_pcc.push("3");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
            }
            else if (numberOfMon % 5 == 0) {
                if (destination == "SCC") {
                    to_be_append_OFF = (task["Tapes"][3]);
                    to_be_append_ON = (task["Tapes"][2]);
                    delivery_scc.push("4-mirror");
                    delivery_pcc.push("3-mirror");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = (task["Tapes"][2]);
                    to_be_append_ON = (task["Tapes"][3]);
                    delivery_scc.push("3");
                    delivery_pcc.push("4");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
            }
            else if (numberOfMon % 5 == 1) {
                if (destination == "SCC") {
                    to_be_append_OFF = (task["Tapes"][4]);
                    to_be_append_ON = (task["Tapes"][3]);
                    delivery_scc.push("5-mirror");
                    delivery_pcc.push("4-mirror");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = (task["Tapes"][3]);
                    to_be_append_ON = (task["Tapes"][4]);
                    delivery_scc.push("4");
                    delivery_pcc.push("5");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "V5", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "V5", rule);
                }
            };
        }
        else if (rule == "monthly" && day == "1" && date != "1" && Number(date) < 9) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            var numberOfMonth = 0;
            for (j = 0; j < months.length; ++j) {
                if (months[j] == month) {
                    numberOfMonth = j + 1;
                }
            };
            if (numberOfMonth % 4 == 1) {
                if (destination == "SCC") {
                    to_be_append_OFF = task["Tapes"][2];
                    to_be_append_ON = task["Tapes"][1];
                    delivery_scc.push("3", "3", "3");
                    delivery_pcc.push("2", "2", "2");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = task["Tapes"][1];
                    to_be_append_ON = task["Tapes"][2];
                    delivery_scc.push("2", "2", "2");
                    delivery_pcc.push("3", "3", "3");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
            }
            else if (numberOfMonth % 4 == 2) {
                if (destination == "SCC") {
                    to_be_append_OFF = task["Tapes"][3];
                    to_be_append_ON = task["Tapes"][2];
                    delivery_scc.push("4", "4", "4");
                    delivery_pcc.push("3", "3", "3");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = task["Tapes"][2];
                    to_be_append_ON = task["Tapes"][3];
                    delivery_scc.push("3", "3", "3");
                    delivery_pcc.push("4", "4", "4");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
            }
            else if (numberOfMonth % 4 == 3) {
                if (destination == "SCC") {
                    to_be_append_OFF = task["Tapes"][0];
                    to_be_append_ON = task["Tapes"][3];
                    delivery_scc.push("1", "1", "1");
                    delivery_pcc.push("4", "4", "4");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = task["Tapes"][3];
                    to_be_append_ON = task["Tapes"][0];
                    delivery_scc.push("4", "4", "4");
                    delivery_pcc.push("1", "1", "1");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
            }
            else if (numberOfMonth % 4 == 0) {
                if (destination == "SCC") {
                    to_be_append_OFF = task["Tapes"][1];
                    to_be_append_ON = task["Tapes"][0];
                    delivery_scc.push("2", "2", "2");
                    delivery_pcc.push("1", "1", "1");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
                else if (destination == "PCC") {
                    to_be_append_OFF = task["Tapes"][0];
                    to_be_append_ON = task["Tapes"][1];
                    delivery_scc.push("1", "1", "1");
                    delivery_pcc.push("2", "2", "2");
                    formAppend(to_be_append_OFF, OTCL_path, "SCC", "", rule);
                    formAppend(to_be_append_ON, OTCL_path, "PCC", "", rule);
                }
            }
        }
        else if (rule == "backup") {
            var month_number = "";
            for (j = 0; j < months.length; ++j) {
                if (months[j] == month) {
                    month_number = j + 1;
                    month_number = "0" + month_number.toString();
                }
            };
            to_be_append = (task["Tapes"][0]);
            to_be_append[0] = to_be_append[0].replace('YYYY', year.toString());
            to_be_append[0] = to_be_append[0].replace('MM', month_number.toString());
            formAppend(to_be_append[0], OTCL_path, "SCC", rule, "weekly");
            delivery_scc.push(year.toString() + month_number.toString());
        }
    };
    const numberOfData_2 = Object.keys(data_2).length;
    for (i = 0; i < numberOfData_2; ++i) {
        let task = data_2[i];
        let rule = task["Rules"];
        let to_be_append_OFF = [];
        let to_be_append_ON = [];
        if (rule == "weekly" && day == "1") {
            if (numberOfMon % 5 == 0) {
                to_be_append_OFF = (task["Tapes"][0]);
                to_be_append_ON = (task["Tapes"][2]);
                delivery_scc.push("1-OFF");
                delivery_pcc.push("3-OFF");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "VRMS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "VRMS", rule);
            }
            else if (numberOfMon % 5 == 1) {
                to_be_append_OFF = (task["Tapes"][1]);
                to_be_append_ON = (task["Tapes"][3]);
                delivery_scc.push("2-OFF");
                delivery_pcc.push("4-OFF");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "VRMS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "VRMS", rule);
            }
            else if (numberOfMon % 5 == 2) {
                to_be_append_OFF = (task["Tapes"][2]);
                to_be_append_ON = (task["Tapes"][4]);
                delivery_scc.push("3-OFF");
                delivery_pcc.push("5-OFF");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "VRMS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "VRMS", rule);
            }
            else if (numberOfMon % 5 == 3) {
                to_be_append_OFF = (task["Tapes"][3]);
                to_be_append_ON = (task["Tapes"][0]);
                delivery_scc.push("4-OFF");
                delivery_pcc.push("1-OFF");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "VRMS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "VRMS", rule);
            }
            else if (numberOfMon % 5 == 4) {
                to_be_append_OFF = (task["Tapes"][0]);
                to_be_append_ON = (task["Tapes"][1]);
                delivery_scc.push("1-OFF");
                delivery_pcc.push("2-OFF");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "VRMS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "VRMS", rule);
            }
        }
    };
    const numberOfData_3 = Object.keys(data_3).length;
    for (i = 0; i < numberOfData_3; ++i) {
        let task = data_3[i];
        let rule = task["Rules"];
        let to_be_append_OFF = [];
        let to_be_append_ON = [];
        if (rule == "weekly" && day == "1") {
            if (numberOfMon % 4 == 1) {
                to_be_append_OFF = (task["Tapes"][3]);
                to_be_append_ON = (task["Tapes"][1]);
                delivery_scc.push("4");
                delivery_pcc.push("2");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "PPS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "PPS", rule);
            }
            else if (numberOfMon % 4 == 2) {
                to_be_append_OFF = (task["Tapes"][0]);
                to_be_append_ON = (task["Tapes"][2]);
                delivery_scc.push("1");
                delivery_pcc.push("3");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "PPS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "PPS", rule);
            }
            else if (numberOfMon % 4 == 3) {
                to_be_append_OFF = (task["Tapes"][1]);
                to_be_append_ON = (task["Tapes"][3]);
                delivery_scc.push("2");
                delivery_pcc.push("4");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "PPS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "PPS", rule);
            }
            else if (numberOfMon % 4 == 0) {
                to_be_append_OFF = (task["Tapes"][2]);
                to_be_append_ON = (task["Tapes"][0]);
                delivery_scc.push("3");
                delivery_pcc.push("1");
                formAppend(to_be_append_OFF, OTCL_path, "SCC", "PPS", rule);
                formAppend(to_be_append_ON, OTCL_path, "PCC", "PPS", rule);
            }
        }
    };
    // console.log(delivery_scc);
    // console.log(delivery_pcc);
    var oriJson = fs.readFileSync(delivery_path, 'utf8');
    oriJson = JSON.parse(oriJson);
    var to_append_1 = { ToScc: delivery_scc };
    var to_append_2 = { ToPcc: delivery_pcc };
    oriJson.push(to_append_1);
    oriJson.push(to_append_2);
    fs.writeFileSync(delivery_path, JSON.stringify(oriJson), 'utf8');
};