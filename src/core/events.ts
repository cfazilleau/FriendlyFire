

export class EventObject {
	"pluginName": string;
	"process": (bot: any, msg: any, suffix: any) => void;
}

export class Events {
	[name: string]: { [pluginName: string]: EventObject };
}