"""FastAPI 应用：REST API + 托管前端静态页。"""

from __future__ import annotations

import json
import os
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import database as db
from . import llm, memory, personality, relationships, simulation

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

app = FastAPI(title="AI Society")

db.init_db()

TRAIT_DIMS = personality.TRAIT_DIMS


# ---------------- 数据模型 ----------------

class AgentIn(BaseModel):
    id: str | None = None
    name: str
    color: str = "#5BD1C4"
    identity: str = ""
    values_anchor: str = ""
    background: str = ""
    speaking_style: str = ""
    traits: dict = {}


class RelationIn(BaseModel):
    a: str
    b: str
    affinity: float = 0
    label: str = ""
    familiarity: float | None = None
    trust: float | None = None


class RunIn(BaseModel):
    n: int = 10


class TopicIn(BaseModel):
    topic: str = ""


class WorldviewIn(BaseModel):
    worldview: str = ""


class ResetIn(BaseModel):
    keep_agents: bool = True


class ConfigIn(BaseModel):
    anchor_enabled: bool | None = None
    deliberate: bool | None = None
    deepseek_key: str | None = None
    deepseek_model: str | None = None


# ---------------- 辅助 ----------------

def _agent_row_to_dict(r) -> dict:
    a = dict(r)
    a["traits"] = json.loads(a["traits"] or "{}")
    return a


def _clean_traits(traits: dict) -> dict:
    out = {}
    for d in TRAIT_DIMS:
        v = traits.get(d, 0.5)
        try:
            out[d] = max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            out[d] = 0.5
    return out


# ---------------- Agents ----------------

@app.get("/api/agents")
def list_agents():
    rows = db.query("SELECT * FROM agents ORDER BY created_at ASC")
    agents = []
    for r in rows:
        a = _agent_row_to_dict(r)
        a["summary"] = personality.persona_summary(a)
        agents.append(a)
    return agents


@app.post("/api/agents")
def upsert_agent(payload: AgentIn):
    traits = _clean_traits(payload.traits)
    if payload.id:
        exists = db.query_one("SELECT 1 FROM agents WHERE id=?", (payload.id,))
        if exists:
            db.execute(
                "UPDATE agents SET name=?,color=?,identity=?,values_anchor=?,"
                "background=?,speaking_style=?,traits=? WHERE id=?",
                (payload.name, payload.color, payload.identity, payload.values_anchor,
                 payload.background, payload.speaking_style, json.dumps(traits), payload.id),
            )
            return {"id": payload.id}
    aid = payload.id or uuid.uuid4().hex[:8]
    db.execute(
        "INSERT INTO agents(id,name,color,identity,values_anchor,background,"
        "speaking_style,traits,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        (aid, payload.name, payload.color, payload.identity, payload.values_anchor,
         payload.background, payload.speaking_style, json.dumps(traits), db.now()),
    )
    return {"id": aid}


@app.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: str):
    db.execute("DELETE FROM agents WHERE id=?", (agent_id,))
    return {"ok": True}


# ---------------- Relationships ----------------

@app.get("/api/relationships")
def get_relationships():
    return relationships.all_relationships()


@app.post("/api/relationships")
def set_relationship(payload: RelationIn):
    if payload.a == payload.b:
        raise HTTPException(400, "不能和自己建立关系")
    relationships.set_initial(payload.a, payload.b,
                              max(-100, min(100, payload.affinity)), payload.label,
                              familiarity=payload.familiarity, trust=payload.trust)
    return {"ok": True}


@app.delete("/api/relationships")
def del_relationship(a: str, b: str):
    relationships.delete(a, b)
    return {"ok": True}


@app.get("/api/relationship-history")
def relationship_history(a: str, b: str):
    return relationships.history(a, b)


# ---------------- Simulation ----------------

@app.post("/api/step")
def do_step():
    try:
        return simulation.step()
    except llm.LLMError as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/run")
def do_run(payload: RunIn):
    try:
        msgs = simulation.run_many(payload.n)
        return {"turn": db.get_turn(), "messages": msgs}
    except llm.LLMError as e:
        # 已生成的发言此前每步都已落库；这里返回清晰错误供前端提示填 Key
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/messages")
def get_messages(limit: int = 60):
    rows = db.query(
        "SELECT m.id,m.content,m.thinking,m.mood,m.turn,m.agent_id,a.name,a.color FROM messages m "
        "JOIN agents a ON a.id=m.agent_id ORDER BY m.id DESC LIMIT ?",
        (limit,),
    )
    out = [dict(r) for r in rows]
    out.reverse()
    return out


@app.get("/api/worldview")
def get_worldview():
    return {"worldview": db.get_meta("worldview") or ""}


@app.post("/api/worldview")
def set_worldview(payload: WorldviewIn):
    db.set_meta("worldview", payload.worldview or "")
    return {"ok": True, "worldview": payload.worldview or ""}


@app.post("/api/topic")
def set_topic(payload: TopicIn):
    simulation.set_topic(payload.topic)
    return {"ok": True, "topic": payload.topic}


@app.get("/api/topic")
def read_topic():
    return {"topic": simulation.get_topic() or ""}


@app.post("/api/reset")
def reset(payload: ResetIn):
    db.reset_world(keep_agents=payload.keep_agents)
    return {"ok": True}


# ---------------- 图表数据 ----------------

@app.get("/api/memory/{agent_id}")
def memory_view(agent_id: str, limit: int = 50):
    rows = db.query(
        "SELECT id,kind,content,importance,created_turn,access_count,created_at "
        "FROM memories WHERE agent_id=? ORDER BY created_at DESC LIMIT ?",
        (agent_id, limit),
    )
    return {
        "stats": memory.stats(agent_id),
        "histogram": memory.importance_histogram(agent_id),
        "items": [dict(r) for r in rows],
    }


@app.get("/api/personality/{agent_id}")
def personality_view(agent_id: str):
    return {"history": personality.history(agent_id)}


@app.get("/api/overview")
def overview():
    agents = db.query("SELECT id,name,color FROM agents ORDER BY created_at ASC")
    mem_total = db.query_one("SELECT COUNT(*) c FROM memories")["c"]
    msg_total = db.query_one("SELECT COUNT(*) c FROM messages")["c"]
    # 每个 agent 的记忆增长曲线（按轮）
    growth = {}
    for a in agents:
        rows = db.query(
            "SELECT created_turn, COUNT(*) c FROM memories WHERE agent_id=? "
            "GROUP BY created_turn ORDER BY created_turn ASC",
            (a["id"],),
        )
        cum, series = 0, []
        for r in rows:
            cum += r["c"]
            series.append({"turn": r["created_turn"], "total": cum})
        growth[a["id"]] = series
    return {
        "turn": db.get_turn(),
        "agents": [dict(a) for a in agents],
        "memory_total": mem_total,
        "message_total": msg_total,
        "anchor_enabled": db.anchor_enabled(),
        "memory_growth": growth,
    }


# ---------------- 配置 ----------------

@app.get("/api/config")
def get_config():
    return {
        "provider": "deepseek",
        "anchor_enabled": db.anchor_enabled(),
        "deliberate": llm.deliberate_enabled(),
        "deepseek_model": db.get_meta("deepseek_model") or llm.DEFAULT_MODEL,
        "has_deepseek_key": bool(db.get_meta("deepseek_key")),
        "turn": db.get_turn(),
    }


@app.post("/api/config")
def set_config(payload: ConfigIn):
    if payload.anchor_enabled is not None:
        db.set_meta("anchor_enabled", "1" if payload.anchor_enabled else "0")
    if payload.deliberate is not None:
        db.set_meta("deliberate", "1" if payload.deliberate else "0")
    if payload.deepseek_key:
        db.set_meta("deepseek_key", payload.deepseek_key)
    if payload.deepseek_model:
        db.set_meta("deepseek_model", payload.deepseek_model)
    return get_config()


# ---------------- 示例社会 ----------------

LEIYU_WORLDVIEW = (
    "二十世纪二十年代的中国。一个闷热得让人喘不过气的夏日，从午后一直到深夜，"
    "乌云低低地压着，一场大雷雨即将倾盆而下。\n\n"
    "这里是周公馆——煤矿公司董事长周朴园的家，一座表面体面、规矩森严，骨子里却"
    "腐朽而窒息的旧式资产阶级大宅。空气里满是压抑：关得死紧的窗、喝不完的药、"
    "说不出口的秘密。\n\n"
    "三十年前的一桩旧罪，两个被血缘暗暗缠绕在一起、却彼此并不知情的家庭，"
    "新与旧的观念，富人与穷人的对立，正一起被这沉沉的暑气逼向临界点。"
    "每个人都揣着不能见光的心事，每一句寒暄底下都埋着惊雷。\n\n"
    "在这个雷雨夜，被命运捉弄的人们终将狭路相逢。所有被掩埋的真相、爱欲、"
    "怨恨与罪，都将随着第一道闪电，一同炸开。"
)

DEMO_AGENTS = [
    {
        "name": "周朴园", "color": "#B08D57",
        "identity": "周公馆的家长、煤矿公司董事长，年近花甲。一个把「体面」与「秩序」当作信仰的旧式资本家与封建家长。他习惯了发号施令、被人服从，认定自己一手立下的规矩就是这个家的天理。然而在这副威严之下，深埋着三十年前对一个女人的亏欠与一桩从未了结的旧罪——他靠怀念一个「死去的」侍萍来维持自己道德上的体面，对活着的人却冷酷而吝啬。",
        "values_anchor": "秩序、体面与权威高于一切。家是他的领地，规矩是他的法，错的永远是不守规矩的人。他需要别人服从，也需要一份精心供奉的「旧情」来证明自己并非无情之人——可这份深情，只留给一个他以为永不会再出现的人。一旦体面受到威胁，他会用最克制的方式施展最冷硬的手段。",
        "background": "年轻时与家中侍女侍萍相恋、生下两子，却为迎娶门当户对的小姐，在除夕逼侍萍抱着出生三天的幼子离家、投河。此后娶妻、续娶繁漪，靠矿业发家，手上沾着工人的命。三十年来他在书房供着侍萍用过的旧家具、记着她的生日，把愧疚供奉成一种自我感动的仪式。（他并不知道：今日闯进家门的鲁妈就是侍萍，带头罢工的鲁大海是他亲生的次子。）",
        "speaking_style": "威严、迟缓，字字带着不容置疑的分量。惯用命令句与反问压人——「你来干什么」「谁指使你来的」。对下人冷硬，对外人体面客套；动怒时反而更阴沉克制，极少高声。",
        "traits": {"curiosity": .3, "assertiveness": .95, "warmth": .2,
                   "skepticism": .75, "humor": .1, "emotional": .45},
    },
    {
        "name": "繁漪", "color": "#9B4D6E",
        "identity": "周朴园的续弦，周冲的生母、周萍的继母。一个受过新式教育、却被锁进周公馆这座精神牢笼里的女人。她聪明、敏感、骄傲，有一颗烧得过旺、渴望爱与自由的心；十八年的压抑把这团火逼成了乖戾、阴鸷与近乎疯狂的执拗。她是这宅子里最有「雷雨」性格的人——最不忍的爱，最残酷的恨。",
        "values_anchor": "宁可玉石俱焚，也不愿做一具行尸走肉地活着。她要的是有人真正把她当一个活人去爱。一旦抓住周萍这根救命稻草，就绝不肯松手。被剥夺、被抛弃、被当作疯子，是她唯一不能忍受的事——「我希望我今天变成火山的口，热烈地烧一次」。",
        "background": "嫁入周家十八年，被周朴园以「为你好」之名规训，被当作精神病人逼着吃药、看病。在这死水般的家里，她与丈夫前妻所生的继子周萍越了界，把整个生命押在这场危险的爱上。如今周萍想抽身、想跟着四凤逃走，她被推到绝望的悬崖边，决意要么挽回，要么同归于尽。",
        "speaking_style": "表面克制压抑，话里全是钩子和暗刺；激动时语速陡然加快、又直又利，敢说最狠最真的话。爱用反讽、追问、危险的平静——一句「你忘了你自己是怎样一个人」能把人钉在原地。",
        "traits": {"curiosity": .6, "assertiveness": .8, "warmth": .35,
                   "skepticism": .7, "humor": .15, "emotional": .95},
    },
    {
        "name": "周萍", "color": "#6E8CA0",
        "identity": "周朴园的长子，在周家长大，是这个家名义上的继承人。一个被罪与悔反复煎熬、却始终没有勇气承担的青年。他厌恶过去的自己，把女仆四凤当作通往「干净新生活」的光，却又懦弱得既负不起继母繁漪、也护不住四凤。优柔、自欺，一遇事就想逃。",
        "values_anchor": "渴望被原谅、渴望重新做个「好人」，但比起担当，他更想要解脱。他想斩断与繁漪的过去、抓住四凤奔向新生，骨子里却是逃避——只要能逃离这个家、逃离旧罪，他几乎愿意付出一切，唯独缺少直面真相的勇气。",
        "background": "自幼以为生母早逝，在父亲的威严与冷漠下长大，性格软弱。父亲常年在外时，他与寂寞的继母繁漪越了界，事后陷入无尽悔恨与恐惧；后来爱上女仆四凤，想带她离开这个家。繁漪的纠缠、父亲的压迫，正一步步把他逼向崩溃。（他并不知道：四凤是他同母异父的妹妹，鲁妈侍萍就是他失散多年的生母，罢工的鲁大海是他一母同胞的亲弟弟。）",
        "speaking_style": "游移、闪躲、欲言又止，常自我辩白又自我否定。对繁漪是又怕又烦的低声央求「你疯了」，对四凤是带着歉疚的温柔，对父亲是顺从的唯唯诺诺。很少把话说尽，总在退。",
        "traits": {"curiosity": .4, "assertiveness": .3, "warmth": .45,
                   "skepticism": .4, "humor": .2, "emotional": .8},
    },
    {
        "name": "周冲", "color": "#5FA8D3",
        "identity": "周朴园与繁漪的小儿子，十七岁的中学生。全剧唯一还带着光的人——天真、热情，满脑子平等与理想的梦。他爱慕女仆四凤，真心想分一半学费给她念书、想和她去看海上的白帆。他活在自己编织的美好幻想里，对这个家底下翻涌的罪恶一无所知。",
        "values_anchor": "相信人人平等、相信爱可以超越身份、相信世界本该干净而美好。他要的是一个不分主仆、自由相爱的新天地；这份纯真既是他的光，也是他在这个家里注定要被碾碎的脆弱。",
        "background": "在母亲繁漪的偏爱与父亲的威严下长大，受了些新思想，向往自由与平等。他爱上了家里的女仆四凤，单纯地以为只要自己真诚、肯付出，就能赢得她、改变她的命运。（他不知道四凤与哥哥周萍早已相爱，更不知这个家盘根错节的血缘秘密正要把所有人拖入深渊。）",
        "speaking_style": "明朗、热切，带着少年人的诗意与天真，爱谈理想、谈大海、谈「我们」。对四凤是笨拙而真诚的表白，对母亲是依恋，对世界是不设防的善意。说话常常飞扬，又常常被现实噎住。",
        "traits": {"curiosity": .85, "assertiveness": .4, "warmth": .9,
                   "skepticism": .15, "humor": .45, "emotional": .7},
    },
    {
        "name": "鲁侍萍", "color": "#6B8E7B",
        "identity": "三十年前周家的侍女，如今是底层劳动妇女、四凤的母亲。一个被命运反复碾压却始终把脊梁挺直的女人。她隐忍、清醒、有尊严，把屈辱咽进肚里，唯一的念想就是护住女儿、不让悲剧在下一代重演。命运却偏要她亲眼看着三十年前的旧债，以最残忍的方式轮回。",
        "values_anchor": "尊严与骨气。她可以认命，但不肯再受周家的施舍与侮辱；她更舍不得女儿走自己的老路。她信因果报应，怕的是天意弄人；她要的不过是儿女一份干净安稳的人生——「命，不公平的命指使我来的」。",
        "background": "年轻时被周朴园始乱终弃，除夕抱着病儿被赶出周家、投河被救。此后改嫁鲁贵，生下四凤，靠做工、当老妈子拉扯儿女，吃尽人间苦。三十年后她为接女儿回家，鬼使神差又踏进周公馆，与周朴园重逢，撕开了那道从未愈合的旧伤。（她已认出周萍就是当年留在周家的长子，而周朴园、周萍都还不知她是谁。）",
        "speaking_style": "平静、克制，字字千钧，苦水都压在水面之下。偶尔迸出极痛极清醒的句子。对周朴园是压着三十年恨意的冷峻，对儿女是疲惫而深沉的疼。",
        "traits": {"curiosity": .4, "assertiveness": .65, "warmth": .7,
                   "skepticism": .7, "humor": .1, "emotional": .85},
    },
    {
        "name": "鲁贵", "color": "#C19A4B",
        "identity": "周公馆的仆人、侍萍现在的丈夫、四凤的生父。一个钻营、势利、贪小便宜的市井小人。他眼里只有钱和好处，惯于谄上欺下、打探主子的隐私当筹码，把一双儿女都当成可以变现的本钱。猥琐、油滑，却也活得「明白」。",
        "values_anchor": "有奶便是娘，有钱就是理。他信奉实打实的好处——钱、面子、巴结上人的机会。道德、亲情在他那里都可以折价出售；活下去、活得滋润，比什么都重要。",
        "background": "娶了侍萍，混进周公馆当差，靠察言观色、见风使舵在主仆之间钻营。他撞见过周萍夜里去繁漪屋里的秘密，便揣着当把柄；又惦记着女儿四凤伺候少爷能攀上高枝、儿子大海闹罢工别砸了自己的饭碗。一肚子算计，最怕丢了这份差事。",
        "speaking_style": "油嘴滑舌、阿谀奉承，对上点头哈腰、对下颐指气使。爱拿「我是你爸爸」「我吃的盐比你吃的米多」压家里人，谈起钱和好处眼睛发亮。市井气十足，话里全是算盘。",
        "traits": {"curiosity": .55, "assertiveness": .55, "warmth": .25,
                   "skepticism": .6, "humor": .5, "emotional": .4},
    },
    {
        "name": "四凤", "color": "#E59A8C",
        "identity": "鲁贵与侍萍的女儿，周公馆的女仆，十八岁。一个纯真、善良、勤快又懂事的姑娘。她爱着周家大少爷周萍，把整颗心都交了出去，憧憬着一份本不属于她身份的爱情；却不知这爱情背后，是命运埋下的最残忍的陷阱。她是这场悲剧里最无辜的人之一。",
        "values_anchor": "真心与善良。她信自己爱的人、信母亲，肯为爱付出一切；她要的不过是和心上人在一起的、踏实的小小幸福。她单纯、专一，也因这份单纯，毫无防备地走向深渊。",
        "background": "母亲在外做工，她到周公馆帮佣，被少爷周萍打动、暗结情愫。父亲鲁贵贪图她攀附主家，二少爷周冲又对她一片痴心，继母般的繁漪则在暗中盯着她与周萍。她夹在重重情网与秘密中浑然不觉，只一心想跟着周萍逃出去，过干净的日子。（她不知道周萍其实是自己同母异父的哥哥。）",
        "speaking_style": "怯生生又透着真挚。对周萍是羞涩温柔的依恋，对母亲是乖巧的体己，对周冲是为难的躲闪。说话软和、本分，急起来带着哭腔，从不会拐弯抹角。",
        "traits": {"curiosity": .5, "assertiveness": .3, "warmth": .85,
                   "skepticism": .25, "humor": .3, "emotional": .85},
    },
    {
        "name": "鲁大海", "color": "#B5544A",
        "identity": "侍萍带大的次子，周家煤矿的工人、罢工领袖。一个刚直、火爆、敢和资本家正面硬碰的反抗者。他站在劳资对立的最前线，把董事长周朴园当作压榨工人的死敌。粗豪、莽撞，却有一身不肯弯的硬骨头。",
        "values_anchor": "公道与骨气。他恨一切剥削与不公，要为工人讨一个说法；他认死理、不信眼泪只信抗争。哪怕势单力薄、被人出卖，也绝不向周朴园那样的人低头——宁折不弯。",
        "background": "襁褓中随母投河生还，被侍萍带大，吃尽苦头，成了煤矿工人。他带头闹罢工、当工人代表去和董事长谈判，被周朴园收买的工贼出卖，也被周朴园的体面与算计激得当场翻脸。（他并不知道：台子对面那个冷酷的资本家周朴园，正是他血缘上的生父；周家大少爷周萍，是他一母同胞的亲哥哥。）",
        "speaking_style": "粗声大气、直来直去、毫不留情，火气一上来就拍桌子、撂狠话。对周朴园是毫不掩饰的鄙夷与对抗，对家里人是糙汉子式别扭的关切。从不绕弯，话糙理不糙。",
        "traits": {"curiosity": .4, "assertiveness": .9, "warmth": .4,
                   "skepticism": .8, "humor": .2, "emotional": .7},
    },
]

# 索引：0周朴园 1繁漪 2周萍 3周冲 4鲁侍萍 5鲁贵 6四凤 7鲁大海
DEMO_RELATIONS = [
    # (a, b, 好感, 标签, 熟悉度, 信任)  —— 标签多取「角色此刻所知」的表层关系，隐藏的血缘留给剧情爆发
    (0, 1, -30, "貌合神离的夫妻", 70, 25),       # 周朴园-繁漪：压迫与被压迫
    (0, 2, 35, "威严的父与顺从的子", 65, 55),     # 周朴园-周萍
    (0, 3, 25, "疏远的父子", 55, 45),            # 周朴园-周冲
    (0, 4, -20, "三十年前的旧债", 60, 20),        # 周朴园-侍萍：旧情人与被弃者
    (0, 7, -55, "势不两立的劳资两方", 15, 5),      # 周朴园-大海：资本家与罢工领袖
    (1, 2, 10, "纠缠不清的孽缘", 85, 25),         # 繁漪-周萍：危险的不伦
    (1, 3, 45, "母与子", 75, 60),                # 繁漪-周冲
    (1, 6, -30, "暗中的情敌", 40, 15),           # 繁漪-四凤
    (2, 3, 30, "同父异母的兄弟", 70, 45),         # 周萍-周冲：暗里都爱四凤
    (2, 6, 60, "暗结同心的恋人", 65, 60),         # 周萍-四凤
    (2, 4, 10, "萍水相逢的长辈", 20, 30),         # 周萍-侍萍：不知情的母子
    (3, 6, 50, "少年的一片痴心", 55, 50),         # 周冲-四凤：单恋
    (4, 5, -10, "勉强搭伙的夫妻", 75, 30),        # 侍萍-鲁贵
    (4, 6, 70, "苦命相依的母女", 80, 80),         # 侍萍-四凤
    (4, 7, 65, "相依为命的母子", 80, 75),         # 侍萍-大海
    (5, 6, 15, "各怀心思的父女", 70, 30),         # 鲁贵-四凤
    (5, 7, -15, "话不投机的继父子", 60, 20),       # 鲁贵-大海
    (6, 7, 50, "同母异父的兄妹", 70, 65),         # 四凤-大海
    (2, 5, -5, "握着秘密的下人", 45, 15),         # 周萍-鲁贵
    (2, 7, -20, "对立的少爷与工人", 20, 15),       # 周萍-大海：不知情的亲兄弟
    # 其余关系留白，可在「关系网」手动拉线，或随对话自行生长
]


@app.post("/api/seed")
def seed():
    db.reset_world(keep_agents=False)
    db.set_meta("worldview", LEIYU_WORLDVIEW)   # 载入示例社会时一并载入世界观
    ids = []
    for spec in DEMO_AGENTS:
        aid = uuid.uuid4().hex[:8]
        db.execute(
            "INSERT INTO agents(id,name,color,identity,values_anchor,background,"
            "speaking_style,traits,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (aid, spec["name"], spec["color"], spec["identity"], spec["values_anchor"],
             spec["background"], spec["speaking_style"], json.dumps(spec["traits"]), db.now()),
        )
        ids.append(aid)
    for a, b, aff, label, fam, trust in DEMO_RELATIONS:
        relationships.set_initial(ids[a], ids[b], aff, label, familiarity=fam, trust=trust)
    return {"ok": True, "agents": ids}


# ---------------- 托管前端 ----------------

@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
